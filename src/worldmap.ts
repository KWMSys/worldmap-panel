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

    this.remove_duplicates_safe(data).forEach((dataPoint) => {
      if (!dataPoint.locationName) {
        return;
      }
      circles.push(this.createCircle(dataPoint, data));
    });
    this.circlesLayer = this.addCircles(circles);
    this.circles = circles;
  }

  remove_duplicates_safe(arr: any[]) {
    var seen: any[] = [];
    var ret_arr: any[] = [];
    for (var i = 0; i < arr.length; i++) {
      if (seen.filter((elem) => elem.key === arr[i].key).length === 0) {
        ret_arr.push(arr[i]);
        seen.push(arr[i]);
      }
    }
    return ret_arr;
  }

  updateCircles(data) {
    this.remove_duplicates_safe(data).forEach((dataPoint) => {
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
    // Sortierung geht wohl ned es wird -1 zurück gegeben (mit einer anderen sortieren machen)

    let filteredDataPoints = dataPoints
      .filter((data) => data.key === dataPoint.key)
      .sort((a, b) => 0 - (a.value > b.value ? -1 : 1));

    let sriVal = this.ctrl.panel.sri?.find((el) => +el.id === +dataPoint.key);

    var basicHtmlContent =
      '<div><b>st_name:</b><br><table><thead><tr style="background-color: #397f9e;"><th style="padding: 5px; text-align: center;"> Dauerstufe [min]</th>';
    basicHtmlContent +=
      '<th style="padding: 5px; text-align: center;"> Niederschlagshöhe aktuell [mm]</th><th style="padding: 5px; text-align: center;"> SRI1 (Starkregen) [mm]</th></tr>';
    basicHtmlContent += '</thead><tbody>';

    basicHtmlContent = basicHtmlContent.replace('st_name', stationName);

    // SRI 5 min value
    if (filteredDataPoints[0] !== null && filteredDataPoints[0] !== undefined) {
      basicHtmlContent +=
        '<tr style="text-align: center; background-color: bg_5Min;"><td>5</td><td>value_5</td><td>comp_5</td>';

      basicHtmlContent = basicHtmlContent.replace(
        'value_5',
        filteredDataPoints[0] ? round(filteredDataPoints[0].value, 1).toString() : 'null'
      );
      basicHtmlContent = basicHtmlContent.replace('comp_5', sriVal !== null ? sriVal?.sri5.toString() : 'null');

      if (+sriVal?.sri5 <= +(filteredDataPoints[0] ? filteredDataPoints[0].value : 0)) {
        basicHtmlContent = basicHtmlContent.replace('bg_5Min', 'red');
      } else {
        basicHtmlContent = basicHtmlContent.replace('bg_5Min', 'none');
      }
    }

    // SRI 10 min value
    if (filteredDataPoints[1] !== null && filteredDataPoints[1] !== undefined) {
      basicHtmlContent +=
        '</tr><tr style="text-align: center; background-color: bg_10Min;"><td>10</td><td>value_10</td><td>comp_10</td></tr>';

      basicHtmlContent = basicHtmlContent.replace(
        'value_10',
        filteredDataPoints[1] ? round(filteredDataPoints[1].value, 1).toString() : 'null'
      );
      basicHtmlContent = basicHtmlContent.replace('comp_10', sriVal !== null ? sriVal?.sri10.toString() : 'null');

      if (+sriVal?.sri10 <= +(filteredDataPoints[1] ? filteredDataPoints[1].value : 0)) {
        basicHtmlContent = basicHtmlContent.replace('bg_10Min', 'red');
      } else {
        basicHtmlContent = basicHtmlContent.replace('bg_10Min', 'none');
      }
    }

    // SRI 30 min value
    if (filteredDataPoints[2] !== null && filteredDataPoints[2] !== undefined) {
      basicHtmlContent +=
        '<tr style="text-align: center; background-color: bg_30Min;"><td>30</td><td>value_30</td><td>comp_30</td></tr>';

      basicHtmlContent = basicHtmlContent.replace(
        'value_30',
        filteredDataPoints[2] ? round(filteredDataPoints[2].value, 1).toString() : 'null'
      );
      basicHtmlContent = basicHtmlContent.replace('comp_30', sriVal !== null ? sriVal?.sri30.toString() : 'null');

      if (+sriVal?.sri30 <= +(filteredDataPoints[2] ? filteredDataPoints[2].value : 0)) {
        basicHtmlContent = basicHtmlContent.replace('bg_30Min', 'red');
      } else {
        basicHtmlContent = basicHtmlContent.replace('bg_30Min', 'none');
      }
    }

    // SRI 60 min value
    if (filteredDataPoints[3] !== null && filteredDataPoints[3] !== undefined) {
      basicHtmlContent +=
        '<tr style="text-align: center; background-color: bg_60Min;"><td>60</td><td>value_60</td><td>comp_60</td></tr>';

      basicHtmlContent = basicHtmlContent.replace(
        'value_60',
        filteredDataPoints[3] ? round(filteredDataPoints[3].value, 1).toString() : 'null'
      );
      basicHtmlContent = basicHtmlContent.replace('comp_60', sriVal !== null ? sriVal?.sri60.toString() : 'null');

      if (+sriVal?.sri60 <= +(filteredDataPoints[3] ? filteredDataPoints[3].value : 0)) {
        basicHtmlContent = basicHtmlContent.replace('bg_60Min', 'red');
      } else {
        basicHtmlContent = basicHtmlContent.replace('bg_60Min', 'none');
      }
    }

    // SRI 120 min value
    if (filteredDataPoints[4] !== null && filteredDataPoints[4] !== undefined) {
      basicHtmlContent +=
        '<tr style="text-align: center; background-color: bg_120Min;"><td>120</td><td>value_120</td><td>comp_120</td></tr>';

      basicHtmlContent = basicHtmlContent.replace(
        'value_120',
        filteredDataPoints[4] ? round(filteredDataPoints[4].value, 1).toString() : 'null'
      );
      basicHtmlContent = basicHtmlContent.replace('comp_120', sriVal !== null ? sriVal?.sri120.toString() : 'null');

      if (+sriVal?.sri120 <= +(filteredDataPoints[4] ? filteredDataPoints[4].value : 0)) {
        basicHtmlContent = basicHtmlContent.replace('bg_120Min', 'red');
      } else {
        basicHtmlContent = basicHtmlContent.replace('bg_120Min', 'none');
      }
    }

    // SRI 360 min value
    if (filteredDataPoints[5] !== null && filteredDataPoints[5] !== undefined) {
      basicHtmlContent +=
        '<tr style="text-align: center; background-color: bg_360Min;"><td>360</td><td>value_360</td><td>comp_360</td></tr>';

      basicHtmlContent = basicHtmlContent.replace(
        'value_360',
        filteredDataPoints[5] ? round(filteredDataPoints[5].value, 1).toString() : 'null'
      );
      basicHtmlContent = basicHtmlContent.replace('comp_360', sriVal !== null ? sriVal?.sri360.toString() : 'null');

      if (+sriVal?.sri360 <= +(filteredDataPoints[5] ? filteredDataPoints[5].value : 0)) {
        basicHtmlContent = basicHtmlContent.replace('bg_360Min', 'red');
      } else {
        basicHtmlContent = basicHtmlContent.replace('bg_360Min', 'none');
      }
    }

    basicHtmlContent += '</tbody></table></div>';

    return basicHtmlContent;
  }
}

function round(value, precision) {
  var multiplier = Math.pow(10, precision || 0);
  return Math.round(value * multiplier) / multiplier;
}
