// Measured by tools/bake-quads.mjs / bake-quads2.mjs / bake-sleds.mjs - do not edit by hand, bake again.
// Per quad: model file, centre of mass offset (comX), steering axis, swingarm pivot, rider
// points (model space: +x forward, -z left) and wheel centres / tyre radii for the physics.
export const QUAD_MODELS = {
  venomx: {
    file: 'models/quad_venomx.glb',
    comX: 0.051,
    steerPivot: [0.321, 1.014, 0],
    steerAxisTo: [0.419, 0.575, 0],
    rearPivot: [-0.17, 0.375, 0],
    attach: {
      seat: [-0.261, 0.959, 0],
      pegL: [-0.025, 0.294, -0.3],
      pegR: [-0.025, 0.294, 0.3],
      gripL: [0.278, 1.049, -0.37],
      gripR: [0.278, 1.049, 0.37]
    },
    wheels: {
      zF: 0.75,
      zR: -0.75,
      xF: 0.662,
      xR: 0.74,
      rF: 0.278,
      rR: 0.298
    },
    size: {
      length: 2.24,
      width: 1.818
    }
  },
  atv450: {
    file: 'models/quad_atv450.glb',
    comX: 0.048,
    steerPivot: [0.321, 1.08, 0],
    steerAxisTo: [0.42, 0.641, 0],
    rearPivot: [-0.169, 0.394, 0],
    attach: {
      seat: [-0.241, 0.925, 0],
      pegL: [-0.025, 0.325, -0.3],
      pegR: [-0.025, 0.325, 0.3],
      gripL: [0.321, 1.08, -0.344],
      gripR: [0.321, 1.08, 0.344]
    },
    wheels: {
      zF: 0.687,
      zR: -0.687,
      xF: 0.503,
      xR: 0.607,
      rF: 0.299,
      rR: 0.299
    },
    size: {
      length: 2.021,
      width: 1.496
    }
  },
  atv700: {
    file: 'models/quad_atv700.glb',
    comX: 0.046,
    steerPivot: [0.346, 1.22, 0],
    steerAxisTo: [0.459, 0.737, 0],
    rearPivot: [-0.193, 0.464, 0],
    attach: {
      seat: [-0.273, 1.048, 0],
      pegL: [-0.035, 0.388, -0.33],
      pegR: [-0.035, 0.388, 0.33],
      gripL: [0.346, 1.22, -0.407],
      gripR: [0.346, 1.22, 0.424]
    },
    wheels: {
      zF: 0.756,
      zR: -0.756,
      xF: 0.596,
      xR: 0.705,
      rF: 0.373,
      rR: 0.389
    },
    size: {
      length: 2.237,
      width: 1.751
    }
  },
  atv250: {
    file: 'models/quad_atv250.glb',
    comX: 0.044,
    steerPivot: [0.289, 0.972, 0],
    steerAxisTo: [0.374, 0.576, 0],
    rearPivot: [-0.152, 0.353, 0],
    attach: {
      seat: [-0.217, 0.834, 0],
      pegL: [-0.023, 0.294, -0.27],
      pegR: [-0.023, 0.294, 0.27],
      gripL: [0.289, 0.972, -0.291],
      gripR: [0.289, 0.972, 0.303]
    },
    wheels: {
      zF: 0.619,
      zR: -0.619,
      xF: 0.435,
      xR: 0.524,
      rF: 0.257,
      rR: 0.265
    },
    size: {
      length: 1.818,
      width: 1.279
    }
  },
  atv1000: {
    file: 'models/quad_atv1000.glb',
    comX: 0.008,
    steerPivot: [0.205, 1.24, 0],
    steerAxisTo: [0.312, 0.774, 0],
    rearPivot: [-0.221, 0.503, 0],
    attach: {
      seat: [-0.298, 1.075, 0],
      pegL: [-0.069, 0.439, -0.318],
      pegR: [-0.069, 0.439, 0.318],
      gripL: [0.196, 1.24, -0.342],
      gripR: [0.214, 1.24, 0.317]
    },
    wheels: {
      zF: 0.729,
      zR: -0.729,
      xF: 0.584,
      xR: 0.679,
      rF: 0.382,
      rR: 0.382
    },
    size: {
      length: 2.226,
      width: 1.688
    }
  },
  atv450w: {
    file: 'models/quad_atv450w.glb',
    comX: 0.012,
    steerPivot: [0.507, 1.04, 0],
    steerAxisTo: [0.606, 0.6, 0],
    rearPivot: [-0.078, 0.366, 0],
    attach: {
      seat: [-0.146, 0.885, 0],
      pegL: [0.07, 0.285, -0.3],
      pegR: [0.07, 0.285, 0.3],
      gripL: [0.507, 1.04, -0.33],
      gripR: [0.507, 1.04, 0.345]
    },
    wheels: {
      zF: 0.818,
      zR: -0.817,
      xF: 0.524,
      xR: 0.698,
      rF: 0.289,
      rR: 0.295
    },
    size: {
      length: 2.211,
      width: 1.772
    }
  },
  sled400: {
    file: 'models/quad_sled400.glb',
    comX: 0,
    steerPivot: [-0.155, 1.198, 0],
    steerAxisTo: [-0.035, 0.698, 0],
    rearPivot: [-0.048, 0.348, 0],
    attach: {
      seat: [-0.66, 1.012, 0],
      pegL: [-0.621, 0.496, -0.336],
      pegR: [-0.621, 0.496, 0.336],
      gripL: [-0.135, 1.181, -0.258],
      gripR: [-0.135, 1.181, 0.258]
    },
    wheels: {
      zF: 0.776,
      zR: -0.782,
      xF: 0.512,
      xR: 0.125,
      rF: 0.2,
      rR: 0.24
    },
    size: {
      length: 2.926,
      width: 1.201
    },
    belt: {
      k: 6,
      pitch: 0.068
    }
  },
  sled600: {
    file: 'models/quad_sled600.glb',
    comX: 0,
    steerPivot: [-0.191, 1.213, 0],
    steerAxisTo: [-0.071, 0.713, 0],
    rearPivot: [-0.084, 0.347, 0],
    attach: {
      seat: [-0.649, 1.012, 0],
      pegL: [-0.617, 0.496, -0.336],
      pegR: [-0.617, 0.496, 0.336],
      gripL: [-0.172, 1.196, -0.258],
      gripR: [-0.172, 1.196, 0.258]
    },
    wheels: {
      zF: 0.74,
      zR: -0.746,
      xF: 0.512,
      xR: 0.125,
      rF: 0.2,
      rR: 0.24
    },
    size: {
      length: 2.769,
      width: 1.201
    },
    belt: {
      k: 6,
      pitch: 0.056
    }
  },
  sled800: {
    file: 'models/quad_sled800.glb',
    comX: 0,
    steerPivot: [-0.065, 1.417, 0],
    steerAxisTo: [0.055, 0.917, 0],
    rearPivot: [0.043, 0.404, 0],
    attach: {
      seat: [-0.688, 1.096, 0],
      pegL: [-0.632, 0.58, -0.336],
      pegR: [-0.632, 0.58, 0.336],
      gripL: [-0.045, 1.4, -0.258],
      gripR: [-0.045, 1.4, 0.258]
    },
    wheels: {
      zF: 0.867,
      zR: -0.873,
      xF: 0.512,
      xR: 0.125,
      rF: 0.2,
      rR: 0.24
    },
    size: {
      length: 3.318,
      width: 1.201
    },
    belt: {
      k: 6,
      pitch: 0.096
    }
  },
  sled1000: {
    file: 'models/quad_sled1000.glb',
    comX: 0,
    steerPivot: [-0.107, 1.126, 0],
    steerAxisTo: [0.013, 0.626, 0],
    rearPivot: [0, 0.326, 0],
    attach: {
      seat: [-0.555, 0.976, 0],
      pegL: [-0.525, 0.46, -0.336],
      pegR: [-0.525, 0.46, 0.336],
      gripL: [-0.087, 1.109, -0.258],
      gripR: [-0.087, 1.109, 0.258]
    },
    wheels: {
      zF: 0.825,
      zR: -0.831,
      xF: 0.512,
      xR: 0.125,
      rF: 0.2,
      rR: 0.24
    },
    size: {
      length: 3.037,
      width: 1.201
    },
    belt: {
      k: 6,
      pitch: 0.045
    }
  }
};
