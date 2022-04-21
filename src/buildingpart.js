/**
 * An OSM Building Part
 *
 * A building part includes a main building and a roof.
 */
class BuildingPart {
  // DOM of the building part way
  way;

  // THREE.Shape of the outline.
  shape;

  // THREE.Mesh of the roof
  roof;

  // array of Cartesian coordinates of every node.
  nodelist = [];

  // Metadata of the building part.
  blankOptions = {
    building: {
      colour: null,
      ele: null,
      height: null,
      levels: null,
      levelsUnderground: null,
      material: null,
      minHeight: null,
      minLevel: null,
      walls: null,
    },
    roof: {
      angle: null,
      colour: null,
      direction: null,
      height: null,
      levels: null,
      material: null,
      orientation: null,
      shape: null,
    },
  };

  fullXmlData;

  /**
   * @param {number} id - the OSM id of the way or multipolygon.
   * @param {XMLDocument} fullXmlData - XML for the region.
   * @param {[[number, number],...]} nodelist - Cartesian coordinates of each node keyed by node refID
   * @param {object} options - default values for the building part.
   */
  constructor(id, fullXmlData, nodelist, defaultOptions = {}) {
    if (Object.keys(defaultOptions).length === 0) {
      defaultOptions = this.blankOptions;
    }
    this.options.inherited = defaultOptions;
    this.fullXmlData = fullXmlData;
    this.id = id;
    this.way = fullXmlData.getElementById(id);
    this.nodelist = nodelist;
    this.shape = this.buildShape();
    this.setOptions();
  }

  buildShape() {
    this.type = 'way';
    return BuildingShapeUtils.createShape(this.way, this.nodelist);
  }

  /**
   * Set the object's options
   */
  setOptions() {
    // set values from the options, then override them by the local values if one exists.
    const specifiedOptions = this.blankOptions;

    specifiedOptions.building.colour = this.getAttribute('colour');
    specifiedOptions.building.ele = this.getAttribute('ele');
    specifiedOptions.building.height = BuildingPart.normalizeLength(this.getAttribute('height'));
    specifiedOptions.building.levels = this.getAttribute('building:levels');
    specifiedOptions.building.levelsUnderground = this.getAttribute('building:levels:underground');
    specifiedOptions.building.material = this.getAttribute('building:material');
    specifiedOptions.building.minHeight = BuildingPart.normalizeLength(this.getAttribute('min_height'));
    specifiedOptions.building.minLevel = this.getAttribute('building:min_level');
    specifiedOptions.building.walls = this.getAttribute('walls');
    specifiedOptions.roof.angle = this.getAttribute('roof:angle');
    specifiedOptions.roof.colour = this.getAttribute('roof:colour');
    specifiedOptions.roof.direction = this.getAttribute('roof:direction');
    specifiedOptions.roof.height = BuildingPart.normalizeLength(this.getAttribute('roof:height'));
    specifiedOptions.roof.levels = this.getAttribute('roof:levels');
    specifiedOptions.roof.material = this.getAttribute('roof:material');
    specifiedOptions.roof.orientation = this.getAttribute('roof:orientation');
    specifiedOptions.roof.shape = this.getAttribute('roof:shape');

    this.options.specified = specifiedOptions;

    const calculatedOptions = this.blankOptions;
    // todo replace with some sort of foreach loop.
    calculatedOptions.building.colour = this.options.specified.building.colour ?? this.options.inherited.building.colour;
    calculatedOptions.building.ele = this.options.specified.building.ele ?? this.options.inherited.building.ele ?? 0;
    calculatedOptions.building.levels = this.options.specified.building.levels ?? this.options.inherited.building.levels;
    calculatedOptions.building.levelsUnderground = this.options.specified.building.levelsUnderground ?? this.options.inherited.building.levelsUnderground;
    calculatedOptions.building.material = this.options.specified.building.material ?? this.options.inherited.building.material;
    calculatedOptions.building.minLevel = this.options.specified.building.minLevel ?? this.options.inherited.building.minLevel;
    calculatedOptions.building.walls = this.options.specified.building.walls ?? this.options.inherited.building.walls;
    calculatedOptions.roof.angle = this.options.specified.roof.angle ?? this.options.inherited.roof.angle;
    calculatedOptions.roof.colour = this.options.specified.roof.colour ?? this.options.inherited.roof.colour;
    calculatedOptions.roof.direction = this.options.specified.roof.direction ?? this.options.inherited.roof.direction;
    calculatedOptions.roof.levels = this.options.specified.roof.levels ?? this.options.inherited.roof.levels;
    calculatedOptions.roof.material = this.options.specified.roof.material ?? this.options.inherited.roof.material;
    calculatedOptions.roof.orientation = this.options.specified.roof.orientation ?? this.options.inherited.roof.orientation ?? 'along';
    calculatedOptions.roof.shape = this.options.specified.roof.shape ?? this.options.inherited.roof.shape ?? 'flat';

    calculatedOptions.roof.height = this.options.specified.roof.height ?? 
      this.options.inherited.roof.height ?? 
      (calculatedOptions.roof.levels * 3) ??
      (calculatedOptions.roof.shape === 'flat' ? 0) ??
      (calculatedOptions.roof.shape === 'dome' || calculatedOptions.roof.shape === 'pyramidal' ? BuildingShapeUtils.calulateRadius(this.shape));
    this.options.building = calculatedOptions.building;
    this.options.roof = calculatedOptions.roof;
    if (this.getAttribute('building:part') && this.options.building.height > defaultOptions.building.height) {
      console.log('Way ' + this.id + ' is taller than building. (' + this.options.building.height + '>' + defaultOptions.building.height + ')');
    }
  }

  /**
   * calculate the maximum building width in meters.
   */
  getWidth() {
    return BuildingShapeUtils.getWidth(this.shape);
  }

  /**
   * Calculate the radius of a circle that can fit within
   * this way.
   */
  calculateRadius() {
    const elements = this.way.getElementsByTagName('nd');
    var lats = [];
    var lons = [];
    let ref = 0;
    var node;
    for (let i = 0; i < elements.length; i++) {
      ref = elements[i].getAttribute('ref');
      node = this.nodelist[ref];
      lats.push(node[1]);
      lons.push(node[0]);
    }
    const left = Math.min(...lons);
    const bottom = Math.min(...lats);
    const right = Math.max(...lons);
    const top = Math.max(...lats);

    // Set the "home point", the lat lon to center the structure.
    return Math.min(right - left, top - bottom) / 2;
  }

  /**
   * Render the building part
   */
  render() {
    scene.add(this.roof);
    this.createBuilding();
  }

  createBuilding() {
    let extrusionHeight = this.options.building.height - this.options.roof.minHeight - (this.options.roof.height ?? 0);

    let extrudeSettings = {
      bevelEnabled: false,
      depth: extrusionHeight,
    };

    var geometry = new THREE.ExtrudeGeometry(this.shape, extrudeSettings);

    // Create the mesh.
    var mesh = new THREE.Mesh(geometry, [BuildingPart.getRoofMaterial(this.way), BuildingPart.getMaterial(this.way)]);

    // Change the position to compensate for the min_height
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set( 0, this.options.roof.minHeight, 0);
    scene.add( mesh );
  }

  /**
   * Create the 3D render of a roof.
   */
  createRoof() {
    var way = this.way;
    var material;

    if (this.options.roof.shape === 'flat') {
      // do nothing
    } else if (this.options.roof.shape === 'dome') {
    //   find largest circle within the way
    //   R, x, y
      const R = BuildingShapeUtils.calulateRadius(this.shape)
      const geometry = new THREE.SphereGeometry( R, 100, 100, 0, 2 * Math.PI, Math.PI/2 );
      // Adjust the dome height if needed.
      geometry.scale(1, this.options.roof.height / R, 1);
      material = BuildingPart.getRoofMaterial(this.way);
      const roof = new THREE.Mesh( geometry, material );
      const elevation = this.options.building.height - this.options.roof.height;
      const center = BuildingShapeUtils.center(this.shape);
      roof.rotation.x = -Math.PI;
      roof.position.set(center[0], elevation, -1 * center[1]);
      this.roof = roof;
    } else if (this.options.roof.shape === 'skillion') {
      const options = {
        angle: (360 - this.options.roof.direction) / 360 * 2 * Math.PI,
        depth: this.options.roof.height,
        pitch: this.options.roof.angle,
      };
      const geometry = new RampGeometry(this.shape, options);

      material = BuildingPart.getRoofMaterial(this.way);
      const roof = new THREE.Mesh( geometry, material );
      roof.rotation.x = -Math.PI / 2;
      roof.position.set( 0, this.options.building.height - this.options.roof.height, 0);
      scene.add( roof );
    } else if (this.options.roof.shape === 'onion') {
      const R = this.calculateRadius();
      const geometry = new THREE.SphereGeometry( R, 100, 100, 0, 2 * Math.PI, 0, 2.53 );
      // Adjust the dome height if needed.
      if (this.options.roof.height === 0) {
        this.options.roof.height = R;
      }
      geometry.scale(1, this.options.roof.height / R, 1);
      material = BuildingPart.getRoofMaterial(this.way);
      const roof = new THREE.Mesh( geometry, material );
      const elevation = this.options.building.height - this.options.roof.height;
      const center = BuildingShapeUtils.center(this.shape);
      roof.rotation.x = -Math.PI;
      roof.position.set(center[0], elevation, -1 * center[1]);
      this.roof = roof;
    } else if (this.options.roof.shape === 'gabled') {
    } else if (this.options.roof.shape === 'pyramidal') {
      const center = BuildingShapeUtils.center(this.shape);
      const options = {
        center: center,
        depth: this.options.roof.height,
      };
      const geometry = new PyramidGeometry(this.shape, options);

      material = BuildingPart.getRoofMaterial(this.way);
      const roof = new THREE.Mesh( geometry, material );
      roof.rotation.x = -Math.PI / 2;
      roof.position.set( 0, this.options.building.height - this.options.roof.height, 0);
      this.roof = roof;
    }
  }

  getAttribute(key) {
    if (this.way.querySelector('[k="' + key + '"]') !== null) {
      // if the buiilding part has a helght tag, use it.
      return this.way.querySelector('[k="' + key + '"]').getAttribute('v');
    }
  }

  /**
   * The full height of the part in meters, roof and building.
   */
  calculateHeight() {
    var height = 3;

    if (this.way.querySelector('[k="height"]') !== null) {
      // if the buiilding part has a helght tag, use it.
      height = this.way.querySelector('[k="height"]').getAttribute('v');
    } else if (this.way.querySelector('[k="building:levels"]') !== null) {
      // if not, use building:levels and 3 meters per level.
      height = 3 * this.way.querySelector('[k="building:levels"]').getAttribute('v') + this.options.roof.height;
    } else if (this.way.querySelector('[k="building:part"]') !== null) {
      if (this.way.querySelector('[k="building:part"]').getAttribute('v') === 'roof') {
        // a roof has no building part by default.
        height = this.options.roof.height;
      }
    }

    return BuildingPart.normalizeLength(height);
  }

  calculateMinHeight() {
    var minHeight = 0;
    if (this.way.querySelector('[k="min_height"]') !== null) {
      // if the buiilding part has a min_helght tag, use it.
      minHeight = this.way.querySelector('[k="min_height"]').getAttribute('v');
    } else if (this.way.querySelector('[k="building:min_level"]') !== null) {
      // if not, use building:min_level and 3 meters per level.
      minHeight = 3 * this.way.querySelector('[k="building:min_level"]').getAttribute('v');
    }
    return BuildingPart.normalizeLength(minHeight);
  }

  /**
   * convert an string of length units in various format to
   * a float in meters.
   */
  static normalizeLength(length) {
    // if feet and inches {
    //   feet = parseFloat(feet_substr);
    //   inches = parseFloat(inch_substr);
    //   return (feet + inches / 12) * 0.3048;
    // } else if (includes an 'm') {
    //   return parseFloat(substr);
    // }
    return parseFloat(length);
  }

  /**
   * Get the THREE.material for a given way
   *
   * This is complicated by inheritance
   */
  static getMaterial(way) {
    var materialName = '';
    var color = '';
    if (way.querySelector('[k="building:facade:material"]') !== null) {
      // if the buiilding part has a designated material tag, use it.
      materialName = way.querySelector('[k="building:facade:material"]').getAttribute('v');
    } else if (way.querySelector('[k="building:material"]') !== null) {
      // if the buiilding part has a designated material tag, use it.
      materialName = way.querySelector('[k="building:material"]').getAttribute('v');
    }
    if (way.querySelector('[k="colour"]') !== null) {
      // if the buiilding part has a designated colour tag, use it.
      color = way.querySelector('[k="colour"]').getAttribute('v');
    } else if (way.querySelector('[k="building:colour"]') !== null) {
      // if the buiilding part has a designated colour tag, use it.
      color = way.querySelector('[k="building:colour"]').getAttribute('v');
    } else if (way.querySelector('[k="building:facade:colour"]') !== null) {
      // if the buiilding part has a designated colour tag, use it.
      color = way.querySelector('[k="building:facade:colour"]').getAttribute('v');
    }
    const material = BuildingPart.getBaseMaterial(materialName);
    if (color !== '') {
      material.color = new THREE.Color(color);
    } else if (materialName === ''){
      material.color = new THREE.Color('white');
    }
    return material;
  }

  /**
   * Get the THREE.material for a given way
   *
   * This is complicated by inheritance
   */
  static getRoofMaterial(way) {
    var materialName = '';
    var color = '';
    if (way.querySelector('[k="roof:material"]') !== null) {
      // if the buiilding part has a designated material tag, use it.
      materialName = way.querySelector('[k="roof:material"]').getAttribute('v');
    }
    if (way.querySelector('[k="roof:colour"]') !== null) {
      // if the buiilding part has a designated mroof:colour tag, use it.
      color = way.querySelector('[k="roof:colour"]').getAttribute('v');
    }
    var material;
    if (materialName === '') {
      material = BuildingPart.getMaterial(way);
    } else {
      material = BuildingPart.getBaseMaterial(materialName);
    }
    if (color !== '') {
      material.color = new THREE.Color(color);
    }
    return material;
  }

  static getBaseMaterial(materialName) {
    var material;
    if (materialName === 'glass') {
      material = new THREE.MeshPhysicalMaterial( {
        color: 0x00374a,
        emissive: 0x011d57,
        reflectivity: 0.1409,
        clearcoat: 1,
      } );
    } else if (materialName === 'grass'){
      material = new THREE.MeshLambertMaterial({
        color: 0x7ec850,
        emissive: 0x000000,
      });
    } else if (materialName === 'bronze') {
      material = new THREE.MeshPhysicalMaterial({
        color:0xcd7f32,
        emissive: 0x000000,
        metalness: 1,
        roughness: 0.127,
      });
    } else if (materialName === 'copper') {
      material = new THREE.MeshLambertMaterial({
        color: 0xa1c7b6,
        emissive: 0x00000,
        reflectivity: 0,
      });
    } else if (materialName === 'stainless_steel' || materialName === 'metal') {
      material = new THREE.MeshPhysicalMaterial({
        color: 0xaaaaaa,
        emissive: 0xaaaaaa,
        metalness: 1,
        roughness: 0.127,
      });
    } else if (materialName === 'brick'){
      material = new THREE.MeshLambertMaterial({
        color: 0xcb4154,
        emissive: 0x1111111,
      });
    } else if (materialName === 'concrete'){
      material = new THREE.MeshLambertMaterial({
        color: 0x555555,
        emissive: 0x1111111,
      });
    } else if (materialName === 'marble') {
      material = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        emissive: 0x1111111,
      });
    } else {
      material = new THREE.MeshLambertMaterial({
        emissive: 0x1111111,
      });
    }
    return material;
  }

  getInfo() {
    return {
      id: this.id,
      type: this.type,
      options: this.options,
      parts: [
      ],
    };
  }
}
