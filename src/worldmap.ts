import * as _ from 'lodash';
import * as L from './libs/leaflet';
import WorldmapCtrl from './worldmap_ctrl';

const tileServers = {
  'CartoDB Positron': {
    url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
      '&copy; <a href="http://cartodb.com/attributions">CartoDB</a>',
    subdomains: 'abcd',
  },
  'CartoDB Dark': {
    url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
      '&copy; <a href="http://cartodb.com/attributions">CartoDB</a>',
    subdomains: 'abcd',
  },
  OpenTopoMap: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution:
      'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    subdomains: 'abc',
  },
  'OpenStreetMap DE': {
    url: 'https://{s}.tile.openstreetmap.de/tiles/osmde/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: 'abc',
  },
};

export default class WorldMap {
  ctrl: WorldmapCtrl;
  mapContainer: any;
  circles: any[];
  map: any;
  legend: any;
  circlesLayer: any;

  constructor(ctrl, mapContainer) {
    this.ctrl = ctrl;
    this.mapContainer = mapContainer;
    this.circles = [];
  }

  createMap() {
    const mapCenter = (window as any).L.latLng(
      parseFloat(this.ctrl.panel.mapCenterLatitude),
      parseFloat(this.ctrl.panel.mapCenterLongitude)
    );
    this.map = L.map(this.mapContainer, {
      worldCopyJump: true,
      preferCanvas: true,
      center: mapCenter,
      zoom: parseInt(this.ctrl.panel.initialZoom, 10) || 1,
    });
    this.setMouseWheelZoom();

    const selectedTileServer = tileServers[this.ctrl.tileServer];
    (window as any).L.tileLayer(selectedTileServer.url, {
      maxZoom: 18,
      subdomains: selectedTileServer.subdomains,
      reuseTiles: true,
      detectRetina: true,
      attribution: selectedTileServer.attribution,
    }).addTo(this.map);
  }

  createLegend() {
    this.legend = (window as any).L.control({ position: 'bottomleft' });
    this.legend.onAdd = () => {
      this.legend._div = (window as any).L.DomUtil.create('div', 'info legend');
      this.legend.update();
      return this.legend._div;
    };

    this.legend.update = () => {
      const thresholds = this.ctrl.data.thresholds;
      let legendHtml = '';
      legendHtml +=
        '<div class="legend-item"><i style="background:' +
        this.ctrl.panel.colors[0] +
        '"></i> ' +
        '&lt; ' +
        thresholds[0] +
        '</div>';
      for (let index = 0; index < thresholds.length; index += 1) {
        legendHtml +=
          '<div class="legend-item"><i style="background:' +
          this.ctrl.panel.colors[index + 1] +
          '"></i> ' +
          thresholds[index] +
          (thresholds[index + 1] ? '&ndash;' + thresholds[index + 1] + '</div>' : '+');
      }
      this.legend._div.innerHTML = legendHtml;
    };
    this.legend.addTo(this.map);
  }

  needToRedrawCircles(data) {
    if (this.circles.length === 0 && data.length > 0) {
      return true;
    }

    if (this.circles.length !== data.length) {
      return true;
    }

    const locations = _.map(_.map(this.circles, 'options'), 'location').sort();
    const dataPoints = _.map(data, 'key').sort();
    return !_.isEqual(locations, dataPoints);
  }

  filterEmptyAndZeroValues(data) {
    return _.filter(data, (o) => {
      return !(this.ctrl.panel.hideEmpty && _.isNil(o.value)) && !(this.ctrl.panel.hideZero && o.value === 0);
    });
  }

  clearCircles() {
    if (this.circlesLayer) {
      this.circlesLayer.clearLayers();
      this.removeCircles();
      this.circles = [];
    }
  }

  drawCircles() {
    const data = this.filterEmptyAndZeroValues(this.ctrl.data);
    if (this.needToRedrawCircles(data)) {
      this.clearCircles();
      this.createCircles(data);
    } else {
      this.updateCircles(data);
    }
  }

  createCircles(data) {
    const circles: any[] = [];
    data.forEach((dataPoint) => {
      if (!dataPoint.locationName) {
        return;
      }
      circles.push(this.createCircle(dataPoint, data));
    });
    this.circlesLayer = this.addCircles(circles);
    this.circles = circles;
  }

  updateCircles(data) {
    data.forEach((dataPoint) => {
      if (!dataPoint.locationName) {
        return;
      }

      const circle = _.find(this.circles, (cir) => {
        return cir.options.location === dataPoint.key;
      });

      if (circle) {
        circle.setRadius(this.calcCircleSize(dataPoint.value || 0));
        circle.setStyle({
          color: this.getColor(dataPoint.value),
          fillColor: this.getColor(dataPoint.value),
          fillOpacity: 0.5,
          location: dataPoint.key,
        });
        circle.unbindPopup();
        this.createPopup(circle, dataPoint.locationName, dataPoint.valueRounded, dataPoint, data);
      }
    });
  }

  // hier wird das createPopup aufgerufen
  createCircle(dataPoint, data) {
    const circle = (window as any).L.circleMarker([dataPoint.locationLatitude, dataPoint.locationLongitude], {
      radius: this.calcCircleSize(dataPoint.value || 0),
      color: this.getColor(dataPoint.value),
      fillColor: this.getColor(dataPoint.value),
      fillOpacity: 0.5,
      location: dataPoint.key,
    });

    this.createPopup(circle, dataPoint.locationName, dataPoint.valueRounded, dataPoint, data);
    return circle;
  }

  calcCircleSize(dataPointValue) {
    const circleMinSize = parseInt(this.ctrl.panel.circleMinSize, 10) || 2;
    const circleMaxSize = parseInt(this.ctrl.panel.circleMaxSize, 10) || 30;

    if (this.ctrl.data.valueRange === 0) {
      return circleMaxSize;
    }

    const dataFactor = (dataPointValue - this.ctrl.data.lowestValue) / this.ctrl.data.valueRange;
    const circleSizeRange = circleMaxSize - circleMinSize;

    return circleSizeRange * dataFactor + circleMinSize;
  }

  // Todo: Hier wird das popup erstellt.
  // gucken was die klasse worldmap-popup macht
  createPopup(circle, locationName, value, dataPoint, data) {
    const unit = value && value === 1 ? this.ctrl.panel.unitSingular : this.ctrl.panel.unitPlural;
    let label = (locationName + ': ' + value + ' ' + (unit || '')).trim();
    // try to inject into the label html code
    if (this.ctrl.panel.displayMode === 'rain gauge display') {
      label = this.generateTablePopupContent(dataPoint, data, locationName);
    }
    circle.bindPopup(label, {
      offset: (window as any).L.point(0, -2),
      className: 'worldmap-popup',
      closeButton: this.ctrl.panel.stickyLabels,
    });

    circle.on('mouseover', function onMouseOver(this: any, evt) {
      const layer = evt.target;
      layer.bringToFront();
      this.openPopup();
    });

    if (!this.ctrl.panel.stickyLabels) {
      circle.on('mouseout', function onMouseOut() {
        circle.closePopup();
      });
    }
  }

  getColor(value) {
    for (let index = this.ctrl.data.thresholds.length; index > 0; index -= 1) {
      if (value >= this.ctrl.data.thresholds[index - 1]) {
        return this.ctrl.panel.colors[index];
      }
    }
    return _.first(this.ctrl.panel.colors);
  }

  resize() {
    this.map.invalidateSize();
  }

  panToMapCenter() {
    this.map.panTo([parseFloat(this.ctrl.panel.mapCenterLatitude), parseFloat(this.ctrl.panel.mapCenterLongitude)]);
    this.ctrl.mapCenterMoved = false;
  }

  removeLegend() {
    this.legend.remove(this.map);
    this.legend = null;
  }

  setMouseWheelZoom() {
    if (!this.ctrl.panel.mouseWheelZoom) {
      this.map.scrollWheelZoom.disable();
    } else {
      this.map.scrollWheelZoom.enable();
    }
  }

  addCircles(circles) {
    return (window as any).L.layerGroup(circles).addTo(this.map);
  }

  removeCircles() {
    this.map.removeLayer(this.circlesLayer);
  }

  setZoom(zoomFactor) {
    this.map.setZoom(parseInt(zoomFactor, 10));
  }

  remove() {
    this.circles = [];
    if (this.circlesLayer) {
      this.removeCircles();
    }
    if (this.legend) {
      this.removeLegend();
    }
    this.map.remove();
  }

  generateTablePopupContent(dataPoint, dataPoints, stationName: string) {
    let filteredDataPoints = dataPoints
      .filter((data) => data.key === dataPoint.key)
      .sort((a, b) => 0 - (a.valueRounded > b.valueRounded ? -1 : 1));

    var basicHtmlContent =
      '<div><b>st_name:</b><br><table><thead><tr style="background-color: #397f9e;"><th style="padding: 5px; text-align: center;"> Dauerstufe [min]</th>';
    basicHtmlContent +=
      '<th style="padding: 5px; text-align: center;"> Niederschlag jetzt [mm]</th><th style="padding: 5px; text-align: center;"> Starkregen [mm]</th></tr>';
    basicHtmlContent +=
      '</thead><tbody><tr style="text-align: center; background-color: bg_5Min;"><td>5</td><td>value_5</td><td>comp_5</td>';
    basicHtmlContent +=
      '</tr><tr style="text-align: center; background-color: bg_10Min;"><td>10</td><td>value_10</td><td>comp_10</td></tr>';
    basicHtmlContent +=
      '<tr style="text-align: center; background-color: bg_30Min;"><td>30</td><td>value_30</td><td>comp_30</td></tr>';
    basicHtmlContent +=
      '<tr style="text-align: center; background-color: bg_60Min;"><td>60</td><td>value_60</td><td>comp_60</td></tr>';
    basicHtmlContent += '</tbody></table></div>';

    basicHtmlContent = basicHtmlContent.replace('st_name', stationName);
    basicHtmlContent = basicHtmlContent.replace(
      'value_5',
      filteredDataPoints[0] ? filteredDataPoints[0].valueRounded.toString() : '-1'
    );
    basicHtmlContent = basicHtmlContent.replace('comp_5', this.ctrl.panel.fiveMinIndex.toString());
    basicHtmlContent = basicHtmlContent.replace(
      'value_10',
      filteredDataPoints[1] ? filteredDataPoints[1].valueRounded.toString() : '-1'
    );
    basicHtmlContent = basicHtmlContent.replace('comp_10', this.ctrl.panel.tenMinIndex.toString());
    basicHtmlContent = basicHtmlContent.replace(
      'value_30',
      filteredDataPoints[2] ? filteredDataPoints[2].valueRounded.toString() : '-1'
    );
    basicHtmlContent = basicHtmlContent.replace('comp_30', this.ctrl.panel.thirtyMinIndex.toString());
    basicHtmlContent = basicHtmlContent.replace(
      'value_60',
      filteredDataPoints[3] ? filteredDataPoints[3].valueRounded.toString() : '-1'
    );
    basicHtmlContent = basicHtmlContent.replace('comp_60', this.ctrl.panel.sixtyMinIndex.toString());
    if (+this.ctrl.panel.fiveMinIndex < +(filteredDataPoints[0] ? filteredDataPoints[0].valueRounded : 0)) {
      basicHtmlContent = basicHtmlContent.replace('bg_5Min', 'red');
    } else {
      basicHtmlContent = basicHtmlContent.replace('bg_5Min', 'none');
    }
    if (+this.ctrl.panel.tenMinIndex < +(filteredDataPoints[1] ? filteredDataPoints[1].valueRounded : 0)) {
      basicHtmlContent = basicHtmlContent.replace('bg_10Min', 'red');
    } else {
      basicHtmlContent = basicHtmlContent.replace('bg_10Min', 'none');
    }
    if (+this.ctrl.panel.thirtyMinIndex < +(filteredDataPoints[2] ? filteredDataPoints[2].valueRounded : 0)) {
      basicHtmlContent = basicHtmlContent.replace('bg_30Min', 'red');
    } else {
      basicHtmlContent = basicHtmlContent.replace('bg_30Min', 'none');
    }
    if (+this.ctrl.panel.sixtyMinIndex < +(filteredDataPoints[3] ? filteredDataPoints[3].valueRounded : 0)) {
      basicHtmlContent = basicHtmlContent.replace('bg_60Min', 'red');
    } else {
      basicHtmlContent = basicHtmlContent.replace('bg_60Min', 'none');
    }
    return basicHtmlContent;
  }
}
