// Measured by tools/bake-quads.mjs from the ATV Garage pack - do not edit by hand, bake again.
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
    steerPivot: [0.32, 1.044, 0],
    steerAxisTo: [0.419, 0.605, 0],
    rearPivot: [-0.169, 0.394, 0],
    attach: {
      seat: [-0.241, 0.925, 0],
      pegL: [-0.025, 0.325, -0.3],
      pegR: [-0.025, 0.325, 0.3],
      gripL: [0.278, 1.08, -0.37],
      gripR: [0.278, 1.08, 0.37]
    },
    wheels: {
      zF: 0.687,
      zR: -0.687,
      xF: 0.503,
      xR: 0.607,
      rF: 0.268,
      rR: 0.278
    },
    size: {
      length: 2.021,
      width: 1.496
    }
  },
  atv700: {
    file: 'models/quad_atv700.glb',
    comX: 0.046,
    steerPivot: [0.343, 1.181, 0],
    steerAxisTo: [0.456, 0.698, 0],
    rearPivot: [-0.193, 0.464, 0],
    attach: {
      seat: [-0.273, 1.048, 0],
      pegL: [-0.035, 0.388, -0.33],
      pegR: [-0.035, 0.388, 0.33],
      gripL: [0.298, 1.22, -0.407],
      gripR: [0.298, 1.22, 0.407]
    },
    wheels: {
      zF: 0.756,
      zR: -0.756,
      xF: 0.596,
      xR: 0.705,
      rF: 0.317,
      rR: 0.328
    },
    size: {
      length: 2.237,
      width: 1.751
    }
  },
  atv250: {
    file: 'models/quad_atv250.glb',
    comX: 0.044,
    steerPivot: [0.29, 0.94, 0],
    steerAxisTo: [0.375, 0.544, 0],
    rearPivot: [-0.152, 0.353, 0],
    attach: {
      seat: [-0.217, 0.834, 0],
      pegL: [-0.023, 0.294, -0.27],
      pegR: [-0.023, 0.294, 0.27],
      gripL: [0.25, 0.972, -0.333],
      gripR: [0.25, 0.972, 0.333]
    },
    wheels: {
      zF: 0.619,
      zR: -0.619,
      xF: 0.435,
      xR: 0.524,
      rF: 0.232,
      rR: 0.241
    },
    size: {
      length: 1.818,
      width: 1.279
    }
  },
  atv1000: {
    file: 'models/quad_atv1000.glb',
    comX: 0.008,
    steerPivot: [0.296, 1.203, 0],
    steerAxisTo: [0.403, 0.737, 0],
    rearPivot: [-0.221, 0.503, 0],
    attach: {
      seat: [-0.298, 1.075, 0],
      pegL: [-0.069, 0.439, -0.318],
      pegR: [-0.069, 0.439, 0.318],
      gripL: [0.252, 1.24, -0.392],
      gripR: [0.252, 1.24, 0.392]
    },
    wheels: {
      zF: 0.729,
      zR: -0.729,
      xF: 0.584,
      xR: 0.679,
      rF: 0.339,
      rR: 0.35
    },
    size: {
      length: 2.226,
      width: 1.688
    }
  },
  atv90: {
    file: 'models/quad_atv90.glb',
    comX: 0.023,
    steerPivot: [0.199, 0.691, 0],
    steerAxisTo: [0.245, 0.418, 0],
    rearPivot: [-0.112, 0.282, 0],
    attach: {
      seat: [-0.157, 0.624, 0],
      pegL: [-0.023, 0.252, -0.186],
      pegR: [-0.023, 0.252, 0.186],
      gripL: [0.165, 0.713, -0.229],
      gripR: [0.165, 0.713, 0.229]
    },
    wheels: {
      zF: 0.426,
      zR: -0.426,
      xF: 0.323,
      xR: 0.372,
      rF: 0.185,
      rR: 0.191
    },
    size: {
      length: 1.267,
      width: 0.938
    }
  },
  atv450w: {
    file: 'models/quad_atv450w.glb',
    comX: 0.012,
    steerPivot: [0.415, 1.005, 0],
    steerAxisTo: [0.514, 0.565, 0],
    rearPivot: [-0.078, 0.366, 0],
    attach: {
      seat: [-0.146, 0.885, 0],
      pegL: [0.07, 0.285, -0.3],
      pegR: [0.07, 0.285, 0.3],
      gripL: [0.373, 1.04, -0.37],
      gripR: [0.373, 1.04, 0.37]
    },
    wheels: {
      zF: 0.818,
      zR: -0.817,
      xF: 0.524,
      xR: 0.698,
      rF: 0.26,
      rR: 0.3
    },
    size: {
      length: 2.211,
      width: 1.772
    }
  }
};
