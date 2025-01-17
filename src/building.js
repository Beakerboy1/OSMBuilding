import {BuildingShapeUtils} from './extras/BuildingShapeUtils.js';
import {BuildingPart} from './buildingpart.js';
import {MultiBuildingPart} from './multibuildingpart.js';
/**
 * A class representing an OSM building
 *
 * The static factory is responsible for pulling all required
 * XML data from the API.
 */
class Building {
  // Latitude and longitude that transitioned to (0, 0)
  home = [];

  // the parts
  parts = [];

  // the BuildingPart of the outer building parimeter
  outerElement;

  // DOM Tree of all elements to render
  fullXmlData;

  id = 0;

  // the list of all nodes with lat/lon coordinates.
  nodelist = [];

  // The type of building
  type;
  options;

  /**
   * Create new building
   */
  static async create(type, id) {
    var data;
    if (type === 'way') {
      data = await Building.getWayData(id);
    } else {
      data = await Building.getRelationData(id);
    }
    let xmlData = new window.DOMParser().parseFromString(data, 'text/xml');
    const nodelist = Building.buildNodeList(xmlData);
    const extents = Building.getExtents(id, xmlData, nodelist);
    const innerData = await Building.getInnerData(...extents);
    return new Building(id, innerData);
  }

  /**
   * build an object
   */
  constructor(id, FullXmlData) {
    this.id = id;
    this.fullXmlData = new window.DOMParser().parseFromString(FullXmlData, 'text/xml');
    const outerElementXml = this.fullXmlData.getElementById(id);
    if (outerElementXml.tagName.toLowerCase() === 'way') {
      this.type = 'way';
    } else if (outerElementXml.querySelector('[k="type"]').getAttribute('v') === 'multipolygon') {
      this.type = 'multipolygon';
    } else {
      this.type = 'relation';
    }
    if (this.isValidData(outerElementXml)) {
      this.nodelist = Building.buildNodeList(this.fullXmlData);
      this.setHome();
      this.repositionNodes();
      if (outerElementXml.tagName.toLowerCase() === 'way') {
        this.outerElement = new BuildingPart(id, this.fullXmlData, this.nodelist);
      } else if (outerElementXml.querySelector('[k="type"]').getAttribute('v') === 'multipolygon') {
        this.outerElement = new MultiBuildingPart(id, this.fullXmlData, this.nodelist);
      } else {
        const outlineRef = outerElementXml.querySelector('member[role="outline"]').getAttribute('ref');
        const outline = this.fullXmlData.getElementById(outlineRef);
        const outlineType = outline.tagName.toLowerCase();
        if (outlineType === 'way') {
          this.outerElement = new BuildingPart(id, this.fullXmlData, this.nodelist);
        } else {
          this.outerElement = new MultiBuildingPart(outlineRef, this.fullXmlData, this.nodelist);
        }
      }
      this.addParts();
    } else {
      console.log('XML Not Valid');
    }
  }

  /**
   * the Home point is the center of the outer shape
   */
  setHome() {
    const extents = Building.getExtents(this.id, this.fullXmlData, this.nodelist);
    // Set the "home point", the lat lon to center the structure.
    const homeLon = (extents[0] + extents[2]) / 2;
    const homeLat = (extents[1] + extents[3]) / 2;
    this.home = [homeLon, homeLat];
  }

  /**
   * translate all lat/log values to cartesian and store in an array
   */
  static buildNodeList(fullXmlData) {
    const nodeElements = fullXmlData.getElementsByTagName('node');
    let id = 0;
    var node;
    var coordinates = [];
    var nodeList = [];
    // create a BuildingShape object from the outer and inner elements.
    for (let j = 0; j < nodeElements.length; j++) {
      node = nodeElements[j];
      id = node.getAttribute('id');
      coordinates = [node.getAttribute('lon'), node.getAttribute('lat')];
      nodeList[id] = coordinates;
    }
    return nodeList;
  }

  /**
   *
   */
  repositionNodes() {
    for (const key in this.nodelist) {
      this.nodelist[key] = Building.repositionPoint(this.nodelist[key], this.home);
    }
  }

  render() {
    const mesh = [];
    if (this.parts.length > 0) {
      for (let i = 0; i < this.parts.length; i++) {
        mesh.push(...this.parts[i].render());
      }
    } else {
      const parts = this.outerElement.render();
      mesh.push(parts[0], parts[1]);
    }
    return mesh;
  }

  addParts() {
    if (this.type === 'relation') {
      let parts = this.fullXmlData.getElementById(this.id).querySelectorAll('member[role="part"]');
      for (let i = 0; i < parts.length; i++) {
        const ref = parts[i].getAttribute('ref');
        const part = this.fullXmlData.getElementById(ref);
        if (part.tagName.toLowerCase() === 'way') {
          this.parts.push(new BuildingPart(ref, this.fullXmlData, this.nodelist, this.outerElement.options));
        } else {
          console.log('Adding ' + part.tagName.toLowerCase() + ' ' + ref);
          this.parts.push(new MultiBuildingPart(ref, this.fullXmlData, this.nodelist, this.outerElement.options));
        }
      }
    } else {
      // Filter to all ways
      var parts = this.fullXmlData.getElementsByTagName('way');
      for (let j = 0; j < parts.length; j++) {
        if (parts[j].querySelector('[k="building:part"]')) {
          const id = parts[j].getAttribute('id');
          this.parts.push(new BuildingPart(id, this.fullXmlData, this.nodelist, this.outerElement.options));
        }
      }
      // Filter all relations
      parts = this.fullXmlData.getElementsByTagName('relation');
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].querySelector('[k="building:part"]')) {
          const id = parts[i].getAttribute('id');
          this.parts.push(new MultiBuildingPart(id, this.fullXmlData, this.nodelist, this.outerElement.options));
        }
      }
    }
  }

  /**
   * Fetch way data from OSM
   */
  static async getWayData(id) {
    let restPath = apis.getWay.url(id);
    let response = await fetch(restPath);
    let text = await response.text();
    return text;
  }

  static async getRelationData(id) {
    let restPath = apis.getRelation.url(id);
    let response = await fetch(restPath);
    let text = await response.text();
    return text;
  }

  /**
   * Fetch way data from OSM
   */
  static async getInnerData(left, bottom, right, top) {
    let response = await fetch(apis.bounding.url(left, bottom, right, top));
    let res = await response.text();
    return res;
  }

  /**
   * validate that we have the ID of a building way.
   */
  isValidData(xmlData) {
    // Check that it is a building (<tag k="building" v="*"/> exists)
    const buildingType = xmlData.querySelector('[k="building"]');
    const ways = [];
    if (xmlData.tagName === 'relation') {
      // get all building relation parts
      // todo: multipolygon inner and outer roles.
      let parts = xmlData.querySelectorAll('member[role="part"]');
      var ref = 0;
      for (let i = 0; i < parts.length; i++) {
        ref = parts[i].getAttribute('ref');
        const part = this.fullXmlData.getElementById(ref);
        if (part) {
          ways.push(this.fullXmlData.getElementById(ref));
        } else {
          console.log('Part ' + ref + ' is null.');
        }
      }
    } else {
      if (!buildingType) {
        console.log('Outer way is not a building');
        console.log(xmlData);
        return false;
      }
      ways.push(xmlData);
    }
    for (let i = 0; i < ways.length; i++) {
      const way = ways[i];
      if (way.tagName.toLowerCase() === 'way') {
        const nodes = way.getElementsByTagName('nd');
        if (nodes.length > 0) {
          // Check that it is a closed way
          const firstRef = nodes[0].getAttribute('ref');
          const lastRef = nodes[nodes.length - 1].getAttribute('ref');
          if (firstRef !== lastRef) {
            console.log('Way ' + way.getAttribute('id') + ' is not a closed way. ' + firstRef + ' !== ' + lastRef + '.');
            return false;
          }
        } else {
          console.log('Way ' + way.getAttribute('id') + ' has no nodes.');
          return false;
        }
      } else {
        let parts = way.querySelectorAll('member[role="part"]');
        var ref = 0;
        for (let i = 0; i < parts.length; i++) {
          ref = parts[i].getAttribute('ref');
          const part = this.fullXmlData.getElementById(ref);
          if (part) {
            ways.push(this.fullXmlData.getElementById(ref));
          } else {
            console.log('Part ' + ref + ' is null.');
          }
        }
      }
    }
    return true;
  }

  /**
   * Rotate lat/lon to reposition the home point onto 0,0.
   */
  static repositionPoint(latLon, home) {
    const R = 6371 * 1000;   // Earth radius in m
    const circ = 2 * Math.PI * R;  // Circumference
    const phi = 90 - latLon[1];
    const theta = latLon[0] - home[0];
    const thetaPrime = home[1] / 180 * Math.PI;
    const x = R * Math.sin(theta / 180 * Math.PI) * Math.sin(phi / 180 * Math.PI);
    const y = R * Math.cos(phi / 180 * Math.PI);
    const z = R * Math.sin(phi / 180 * Math.PI) * Math.cos(theta / 180 * Math.PI);
    const abs = Math.sqrt(z**2 + y**2);
    const arg = Math.atan(y / z) - thetaPrime;

    return [x, Math.sin(arg) * abs];
  }

  /**
   * Get the extents of the top level building.
   *
   * @param {number} id - The id of the relation or way
   * @param {XML} fulXmlData - A complete <osm> XML file.
   * @param {[number => [number, number]]} nodelist - x/y or lon/lat coordinated keyed by id
   *
   * @param {[number, number, number, number]} extents - [left, bottom, right, top] of the entire building.
   */
  static getExtents(id, fullXmlData, nodelist) {
    const xmlElement = fullXmlData.getElementById(id);
    const buildingType = xmlElement.tagName.toLowerCase();
    var shape;
    var extents = [];
    if (buildingType === 'way') {
      shape = BuildingShapeUtils.createShape(xmlElement, nodelist);
      extents = BuildingShapeUtils.extents(shape);
    } else if (buildingType === 'relation'){
      const relationType = xmlElement.querySelector('[k="type"]').getAttribute('v');
      if (relationType === 'multipolygon') {
        let outerMembers = xmlElement.querySelectorAll('member[role="outer"]');
        var shape;
        var way;
        for (let i = 0; i < outerMembers.length; i++) {
          way = fullXmlData.getElementById(outerMembers[i].getAttribute('ref'));
          shape = BuildingShapeUtils.createShape(way, nodelist);
          const wayExtents = BuildingShapeUtils.extents(shape);
          if (i === 0) {
            extents = wayExtents;
          } else {
            extents[0] = Math.min(extents[0], wayExtents[0]);
            extents[1] = Math.min(extents[1], wayExtents[1]);
            extents[2] = Math.max(extents[2], wayExtents[2]);
            extents[3] = Math.max(extents[3], wayExtents[3]);
          }
        }
      } else {
        // In a relation, the overall extents may be larger than the outline.
        // use the extents of all the provided nodes.
        extents[0] = 180;
        extents[1] = 90;
        extents[2] = -180;
        extents[3] = -90;
        for (const key in nodelist) {
          extents[0] = Math.min(extents[0], nodelist[key][0]);
          extents[1] = Math.min(extents[1], nodelist[key][1]);
          extents[2] = Math.max(extents[2], nodelist[key][0]);
          extents[3] = Math.max(extents[3], nodelist[key][1]);
        }
      }
    } else {
      console.log('"' + buildingType + '" is neither "way" nor "relation". Check that the id is correct.' + fullXmlData);
    }
    return extents;
  }

  getInfo() {
    var partsInfo = [];
    for (let i = 0; i < this.parts.length; i++) {
      partsInfo.push(this.parts[i].getInfo());
    }
    return {
      id: this.id,
      type: this.type,
      options: this.outerElement.options,
      parts: partsInfo,
    };
  }
}
export {Building};
