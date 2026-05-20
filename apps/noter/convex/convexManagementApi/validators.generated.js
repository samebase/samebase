// Generated from https://api.convex.dev/v1/openapi.json. Do not edit by hand.
/* eslint-disable */

"use strict";
export const ajvPlatformTokenDetailsResponse = validate0;
const schema0 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/components/schemas/PlatformTokenDetailsResponse",
};
const schema2 = {
  oneOf: [
    {
      type: "object",
      required: ["teamId", "name", "createTime", "type"],
      properties: {
        createTime: {
          type: "integer",
          format: "int64",
          description: "Timestamp in milliseconds when this token was created.",
        },
        name: {
          $ref: "#/components/schemas/DeviceName",
          description: "The name given to the token at creation.",
        },
        teamId: {
          $ref: "#/components/schemas/TeamId",
          description: "The team ID this token is associated with.",
        },
        type: { type: "string", enum: ["teamToken"] },
      },
    },
    {
      type: "object",
      required: ["projectId", "name", "createTime", "type"],
      properties: {
        createTime: {
          type: "integer",
          format: "int64",
          description: "Timestamp in milliseconds when this token was created.",
        },
        name: {
          $ref: "#/components/schemas/DeviceName",
          description: "The name given to the token at creation.",
        },
        projectId: {
          $ref: "#/components/schemas/ProjectId",
          description: "The project ID this token is associated with.",
        },
        type: { type: "string", enum: ["projectToken"] },
      },
    },
  ],
};
const schema3 = { type: "string" };
const schema4 = { type: "integer", format: "int64", minimum: 0 };
const schema6 = { type: "integer", format: "int64", minimum: 0 };
function validate2(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate2.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.teamId === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "teamId" },
        message: "must have required property '" + "teamId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.name === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "name" },
        message: "must have required property '" + "name" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.createTime === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "createTime" },
        message: "must have required property '" + "createTime" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.type === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "type" },
        message: "must have required property '" + "type" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.createTime !== undefined) {
      let data0 = data.createTime;
      if (!(typeof data0 == "number" && !(data0 % 1) && !isNaN(data0))) {
        const err4 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/oneOf/0/properties/createTime/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err5 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/components/schemas/DeviceName/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.teamId !== undefined) {
      let data2 = data.teamId;
      if (!(typeof data2 == "number" && !(data2 % 1) && !isNaN(data2))) {
        const err6 = {
          instancePath: instancePath + "/teamId",
          schemaPath: "#/components/schemas/TeamId/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
      if (typeof data2 == "number") {
        if (data2 < 0 || isNaN(data2)) {
          const err7 = {
            instancePath: instancePath + "/teamId",
            schemaPath: "#/components/schemas/TeamId/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      }
    }
    if (data.type !== undefined) {
      let data3 = data.type;
      if (typeof data3 !== "string") {
        const err8 = {
          instancePath: instancePath + "/type",
          schemaPath: "#/oneOf/0/properties/type/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
      if (!(data3 === "teamToken")) {
        const err9 = {
          instancePath: instancePath + "/type",
          schemaPath: "#/oneOf/0/properties/type/enum",
          keyword: "enum",
          params: { allowedValues: schema2.oneOf[0].properties.type.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
  } else {
    const err10 = {
      instancePath,
      schemaPath: "#/oneOf/0/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err10];
    } else {
      vErrors.push(err10);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
    var props0 = {};
    props0.createTime = true;
    props0.name = true;
    props0.teamId = true;
    props0.type = true;
  }
  const _errs13 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.projectId === undefined) {
      const err11 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "projectId" },
        message: "must have required property '" + "projectId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    if (data.name === undefined) {
      const err12 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "name" },
        message: "must have required property '" + "name" + "'",
      };
      if (vErrors === null) {
        vErrors = [err12];
      } else {
        vErrors.push(err12);
      }
      errors++;
    }
    if (data.createTime === undefined) {
      const err13 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "createTime" },
        message: "must have required property '" + "createTime" + "'",
      };
      if (vErrors === null) {
        vErrors = [err13];
      } else {
        vErrors.push(err13);
      }
      errors++;
    }
    if (data.type === undefined) {
      const err14 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "type" },
        message: "must have required property '" + "type" + "'",
      };
      if (vErrors === null) {
        vErrors = [err14];
      } else {
        vErrors.push(err14);
      }
      errors++;
    }
    if (data.createTime !== undefined) {
      let data4 = data.createTime;
      if (!(typeof data4 == "number" && !(data4 % 1) && !isNaN(data4))) {
        const err15 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/oneOf/1/properties/createTime/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err16 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/components/schemas/DeviceName/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
    if (data.projectId !== undefined) {
      let data6 = data.projectId;
      if (!(typeof data6 == "number" && !(data6 % 1) && !isNaN(data6))) {
        const err17 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
      if (typeof data6 == "number") {
        if (data6 < 0 || isNaN(data6)) {
          const err18 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
      }
    }
    if (data.type !== undefined) {
      let data7 = data.type;
      if (typeof data7 !== "string") {
        const err19 = {
          instancePath: instancePath + "/type",
          schemaPath: "#/oneOf/1/properties/type/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
      if (!(data7 === "projectToken")) {
        const err20 = {
          instancePath: instancePath + "/type",
          schemaPath: "#/oneOf/1/properties/type/enum",
          keyword: "enum",
          params: { allowedValues: schema2.oneOf[1].properties.type.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
    }
  } else {
    const err21 = {
      instancePath,
      schemaPath: "#/oneOf/1/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err21];
    } else {
      vErrors.push(err21);
    }
    errors++;
  }
  var _valid0 = _errs13 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
      if (props0 !== true) {
        props0 = props0 || {};
        props0.createTime = true;
        props0.name = true;
        props0.projectId = true;
        props0.type = true;
      }
    }
  }
  if (!valid0) {
    const err22 = {
      instancePath,
      schemaPath: "#/oneOf",
      keyword: "oneOf",
      params: { passingSchemas: passing0 },
      message: "must match exactly one schema in oneOf",
    };
    if (vErrors === null) {
      vErrors = [err22];
    } else {
      vErrors.push(err22);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate2.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate2.evaluated = { dynamicProps: true, dynamicItems: false };
function validate0(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate0.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate2(data, {
      instancePath,
      parentData,
      parentDataProperty,
      rootData,
      dynamicAnchors,
    })
  ) {
    vErrors =
      vErrors === null ? validate2.errors : vErrors.concat(validate2.errors);
    errors = vErrors.length;
  } else {
    var props0 = validate2.evaluated.props;
  }
  validate0.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate0.evaluated = { dynamicProps: true, dynamicItems: false };
export const ajvPlatformProjectDetailsList = validate4;
const schema7 = {
  type: "array",
  items: {
    $ref: "https://api.convex.dev/v1/openapi.json#/components/schemas/PlatformProjectDetails",
  },
};
const schema8 = {
  type: "object",
  required: ["id", "name", "slug", "teamId", "teamSlug", "createTime"],
  properties: {
    createTime: {
      type: "integer",
      format: "int64",
      description: "Timestamp in milliseconds.",
    },
    id: { $ref: "#/components/schemas/ProjectId" },
    name: {
      $ref: "#/components/schemas/ProjectName",
      description: "The full project name, including spaces and punctuation.",
    },
    slug: {
      $ref: "#/components/schemas/ProjectSlug",
      description:
        "This shortened version of the name used in Convex Dashboard URLs.",
    },
    teamId: { $ref: "#/components/schemas/TeamId" },
    teamSlug: {
      $ref: "#/components/schemas/TeamSlug",
      description: "The slug of the team that owns this project.",
    },
  },
};
const schema10 = { type: "string" };
const schema11 = { type: "string" };
const schema13 = { type: "string" };
function validate5(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate5.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "id" },
        message: "must have required property '" + "id" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.name === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "name" },
        message: "must have required property '" + "name" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.slug === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "slug" },
        message: "must have required property '" + "slug" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.teamId === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "teamId" },
        message: "must have required property '" + "teamId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.teamSlug === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "teamSlug" },
        message: "must have required property '" + "teamSlug" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.createTime === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "createTime" },
        message: "must have required property '" + "createTime" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.createTime !== undefined) {
      let data0 = data.createTime;
      if (!(typeof data0 == "number" && !(data0 % 1) && !isNaN(data0))) {
        const err6 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/properties/createTime/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      let data1 = data.id;
      if (!(typeof data1 == "number" && !(data1 % 1) && !isNaN(data1))) {
        const err7 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
      if (typeof data1 == "number") {
        if (data1 < 0 || isNaN(data1)) {
          const err8 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/ProjectId/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err9 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/components/schemas/ProjectName/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.slug !== undefined) {
      if (typeof data.slug !== "string") {
        const err10 = {
          instancePath: instancePath + "/slug",
          schemaPath: "#/components/schemas/ProjectSlug/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.teamId !== undefined) {
      let data4 = data.teamId;
      if (!(typeof data4 == "number" && !(data4 % 1) && !isNaN(data4))) {
        const err11 = {
          instancePath: instancePath + "/teamId",
          schemaPath: "#/components/schemas/TeamId/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
      if (typeof data4 == "number") {
        if (data4 < 0 || isNaN(data4)) {
          const err12 = {
            instancePath: instancePath + "/teamId",
            schemaPath: "#/components/schemas/TeamId/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      }
    }
    if (data.teamSlug !== undefined) {
      if (typeof data.teamSlug !== "string") {
        const err13 = {
          instancePath: instancePath + "/teamSlug",
          schemaPath: "#/components/schemas/TeamSlug/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
  } else {
    const err14 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err14];
    } else {
      vErrors.push(err14);
    }
    errors++;
  }
  validate5.errors = vErrors;
  return errors === 0;
}
validate5.evaluated = {
  props: {
    createTime: true,
    id: true,
    name: true,
    slug: true,
    teamId: true,
    teamSlug: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
function validate4(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate4.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (Array.isArray(data)) {
    const len0 = data.length;
    for (let i0 = 0; i0 < len0; i0++) {
      if (
        !validate5(data[i0], {
          instancePath: instancePath + "/" + i0,
          parentData: data,
          parentDataProperty: i0,
          rootData,
          dynamicAnchors,
        })
      ) {
        vErrors =
          vErrors === null
            ? validate5.errors
            : vErrors.concat(validate5.errors);
        errors = vErrors.length;
      }
    }
  } else {
    const err0 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "array" },
      message: "must be array",
    };
    if (vErrors === null) {
      vErrors = [err0];
    } else {
      vErrors.push(err0);
    }
    errors++;
  }
  validate4.errors = vErrors;
  return errors === 0;
}
validate4.evaluated = { items: true, dynamicProps: false, dynamicItems: false };
export const ajvPlatformCreateProjectResponse = validate7;
const schema14 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/components/schemas/PlatformCreateProjectResponse",
};
const schema15 = {
  type: "object",
  required: ["projectId", "id", "slug"],
  properties: {
    deploymentName: {
      type: ["string", "null"],
      description:
        "The readable identifier for this deployment, something like\nplayful-otter-123. Only present when a deployment was requested.",
    },
    deploymentUrl: {
      type: ["string", "null"],
      description:
        "Deployment cloud URL, where this deployment lives. Only present when a\ndeployment was requested.",
    },
    id: { $ref: "#/components/schemas/ProjectId" },
    projectId: {
      $ref: "#/components/schemas/ProjectId",
      description:
        "Deprecated alias for `id`, kept for backwards compatibility.",
    },
    slug: {
      $ref: "#/components/schemas/ProjectSlug",
      description:
        "The shortened version of the project name used in Convex Dashboard URLs.",
    },
  },
};
function validate8(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate8.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.projectId === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "projectId" },
        message: "must have required property '" + "projectId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.id === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "id" },
        message: "must have required property '" + "id" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.slug === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "slug" },
        message: "must have required property '" + "slug" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.deploymentName !== undefined) {
      let data0 = data.deploymentName;
      if (typeof data0 !== "string" && data0 !== null) {
        const err3 = {
          instancePath: instancePath + "/deploymentName",
          schemaPath: "#/properties/deploymentName/type",
          keyword: "type",
          params: { type: schema15.properties.deploymentName.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.deploymentUrl !== undefined) {
      let data1 = data.deploymentUrl;
      if (typeof data1 !== "string" && data1 !== null) {
        const err4 = {
          instancePath: instancePath + "/deploymentUrl",
          schemaPath: "#/properties/deploymentUrl/type",
          keyword: "type",
          params: { type: schema15.properties.deploymentUrl.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      let data2 = data.id;
      if (!(typeof data2 == "number" && !(data2 % 1) && !isNaN(data2))) {
        const err5 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
      if (typeof data2 == "number") {
        if (data2 < 0 || isNaN(data2)) {
          const err6 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/ProjectId/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
    }
    if (data.projectId !== undefined) {
      let data3 = data.projectId;
      if (!(typeof data3 == "number" && !(data3 % 1) && !isNaN(data3))) {
        const err7 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
      if (typeof data3 == "number") {
        if (data3 < 0 || isNaN(data3)) {
          const err8 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
    }
    if (data.slug !== undefined) {
      if (typeof data.slug !== "string") {
        const err9 = {
          instancePath: instancePath + "/slug",
          schemaPath: "#/components/schemas/ProjectSlug/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
  } else {
    const err10 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err10];
    } else {
      vErrors.push(err10);
    }
    errors++;
  }
  validate8.errors = vErrors;
  return errors === 0;
}
validate8.evaluated = {
  props: {
    deploymentName: true,
    deploymentUrl: true,
    id: true,
    projectId: true,
    slug: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
function validate7(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate7.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate8(data, {
      instancePath,
      parentData,
      parentDataProperty,
      rootData,
      dynamicAnchors,
    })
  ) {
    vErrors =
      vErrors === null ? validate8.errors : vErrors.concat(validate8.errors);
    errors = vErrors.length;
  }
  validate7.errors = vErrors;
  return errors === 0;
}
validate7.evaluated = {
  props: {
    deploymentName: true,
    deploymentUrl: true,
    id: true,
    projectId: true,
    slug: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvPlatformDeploymentResponse = validate10;
const schema19 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/components/schemas/PlatformDeploymentResponse",
};
const schema20 = {
  oneOf: [
    {
      type: "object",
      required: [
        "id",
        "name",
        "createTime",
        "deploymentType",
        "projectId",
        "region",
        "isDefault",
        "reference",
        "deploymentUrl",
        "class",
        "kind",
      ],
      properties: {
        class: {
          type: "string",
          description: "The deployment class for this deployment.",
        },
        createTime: {
          type: "integer",
          format: "int64",
          description:
            "Timestamp in milliseconds when this deployment was created.",
        },
        creator: {
          oneOf: [
            { type: "null" },
            {
              $ref: "#/components/schemas/MemberId",
              description: "The member who created this deployment.",
            },
          ],
        },
        dashboardEditConfirmation: {
          type: ["boolean", "null"],
          description:
            "Controls whether the dashboard requires a confirmation before\nallowing edits during a browser session for this deployment.\nIf not set, defaults to true for prod deployments and false\nfor dev and preview deployments.",
        },
        deploymentType: {
          $ref: "#/components/schemas/DeploymentType",
          description: "The type of this deployment.",
        },
        deploymentUrl: {
          type: "string",
          description:
            'The full backend URL for this deployment (e.g. "https://joyful-capybara-123.convex.cloud" or "https://calm-cow-456.eu-west-1.convex.cloud"). This is always a `.convex.cloud` URL, even when the deployment is using custom domains. To get the canonical URL, use [`/get_canonical_urls`](https://docs.convex.dev/deployment-api/get-canonical-urls).',
        },
        expiresAt: {
          type: ["integer", "null"],
          format: "int64",
          description:
            "Timestamp in milliseconds when this deployment will be\ndeleted. Preview deployments have this set by default unless\noverridden.",
        },
        id: { $ref: "#/components/schemas/DeploymentId" },
        isDefault: {
          $ref: "#/components/schemas/IsDefaultDeployment",
          description:
            "For prod deployments, whether they are the default prod deployment\nof the project. For dev deployments, whether they are the default\ndev deployment for the member that created it.\nFor other deployments, set to false.",
        },
        kind: { type: "string", enum: ["cloud"] },
        lastDeployTime: {
          type: ["integer", "null"],
          format: "int64",
          description:
            "Timestamp in milliseconds of the last deploy to this deployment, if\nany.",
        },
        name: {
          type: "string",
          description:
            "The readable identifier for this deployment, something like\nplayful-otter-123.",
        },
        previewIdentifier: {
          oneOf: [
            { type: "null" },
            {
              $ref: "#/components/schemas/PreviewDeploymentIdentifier",
              description:
                "Preview deployment identifier, if this is a preview deployment.",
            },
          ],
        },
        projectId: {
          $ref: "#/components/schemas/ProjectId",
          description: "The project this deployment belongs to.",
        },
        reference: {
          $ref: "#/components/schemas/DeploymentReference",
          description:
            "An identifier that uniquely identifies this deployment within the\nproject.",
        },
        region: {
          $ref: "#/components/schemas/RegionName",
          description: "The region where this deployment is hosted.",
        },
        sendLogsToClient: {
          type: ["boolean", "null"],
          description:
            "Whether to send function logs to the client. If `null`, the\ndeployment-type default is used (true for dev/preview, false for\nprod).",
        },
      },
    },
    {
      type: "object",
      required: [
        "name",
        "createTime",
        "deploymentType",
        "projectId",
        "creator",
        "port",
        "deviceName",
        "isActive",
        "kind",
      ],
      properties: {
        createTime: {
          type: "integer",
          format: "int64",
          description:
            "Timestamp in milliseconds when this deployment was created.",
        },
        creator: {
          $ref: "#/components/schemas/MemberId",
          description: "The member who created this deployment.",
        },
        deploymentType: {
          $ref: "#/components/schemas/DeploymentType",
          description:
            'Whether this is a "dev" development deployment or "prod" production\ndeployment. Note that this will always be "dev" for local\ndeployments.',
        },
        deviceName: {
          $ref: "#/components/schemas/DeviceName",
          description:
            "The device name where this local deployment is running.",
        },
        isActive: {
          type: "boolean",
          description: "Whether this local deployment is currently active.",
        },
        kind: { type: "string", enum: ["local"] },
        name: {
          type: "string",
          description: "The readable identifier for this deployment.",
        },
        port: {
          type: "integer",
          format: "int32",
          description: "The port where this local deployment is running.",
          minimum: 0,
        },
        previewIdentifier: {
          oneOf: [
            { type: "null" },
            {
              $ref: "#/components/schemas/PreviewDeploymentIdentifier",
              description:
                "Preview deployment identifier. Note that this will always be None\nfor local deployments.",
            },
          ],
        },
        projectId: {
          $ref: "#/components/schemas/ProjectId",
          description: "The project this deployment belongs to.",
        },
      },
    },
  ],
};
const schema21 = { type: "integer", format: "int64", minimum: 0 };
const schema22 = { type: "string", enum: ["dev", "prod", "preview", "custom"] };
const schema23 = { type: "integer", format: "int64", minimum: 0 };
const schema24 = {
  type: "boolean",
  description:
    "Indicates whether the deployment is the default prod deployment for the\nproject, or the default cloud dev deployment for the member in the project.",
};
const schema25 = { type: "string" };
const schema27 = {
  type: "string",
  description:
    "An identifier that uniquely identifies this deployment within the project.",
};
const schema28 = { type: "string", enum: ["aws-us-east-1", "aws-eu-west-1"] };
function validate11(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate11.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "id" },
        message: "must have required property '" + "id" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.name === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "name" },
        message: "must have required property '" + "name" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.createTime === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "createTime" },
        message: "must have required property '" + "createTime" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.deploymentType === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "deploymentType" },
        message: "must have required property '" + "deploymentType" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.projectId === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "projectId" },
        message: "must have required property '" + "projectId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.region === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "region" },
        message: "must have required property '" + "region" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.isDefault === undefined) {
      const err6 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "isDefault" },
        message: "must have required property '" + "isDefault" + "'",
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.reference === undefined) {
      const err7 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "reference" },
        message: "must have required property '" + "reference" + "'",
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.deploymentUrl === undefined) {
      const err8 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "deploymentUrl" },
        message: "must have required property '" + "deploymentUrl" + "'",
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    if (data.class === undefined) {
      const err9 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "class" },
        message: "must have required property '" + "class" + "'",
      };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
    if (data.kind === undefined) {
      const err10 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "kind" },
        message: "must have required property '" + "kind" + "'",
      };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    if (data.class !== undefined) {
      if (typeof data.class !== "string") {
        const err11 = {
          instancePath: instancePath + "/class",
          schemaPath: "#/oneOf/0/properties/class/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.createTime !== undefined) {
      let data1 = data.createTime;
      if (!(typeof data1 == "number" && !(data1 % 1) && !isNaN(data1))) {
        const err12 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/oneOf/0/properties/createTime/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.creator !== undefined) {
      let data2 = data.creator;
      const _errs8 = errors;
      let valid2 = false;
      let passing1 = null;
      const _errs9 = errors;
      if (data2 !== null) {
        const err13 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/oneOf/0/properties/creator/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
      var _valid1 = _errs9 === errors;
      if (_valid1) {
        valid2 = true;
        passing1 = 0;
      }
      const _errs11 = errors;
      if (!(typeof data2 == "number" && !(data2 % 1) && !isNaN(data2))) {
        const err14 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
      if (typeof data2 == "number") {
        if (data2 < 0 || isNaN(data2)) {
          const err15 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
      }
      var _valid1 = _errs11 === errors;
      if (_valid1 && valid2) {
        valid2 = false;
        passing1 = [passing1, 1];
      } else {
        if (_valid1) {
          valid2 = true;
          passing1 = 1;
        }
      }
      if (!valid2) {
        const err16 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/oneOf/0/properties/creator/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing1 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      } else {
        errors = _errs8;
        if (vErrors !== null) {
          if (_errs8) {
            vErrors.length = _errs8;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.dashboardEditConfirmation !== undefined) {
      let data3 = data.dashboardEditConfirmation;
      if (typeof data3 !== "boolean" && data3 !== null) {
        const err17 = {
          instancePath: instancePath + "/dashboardEditConfirmation",
          schemaPath: "#/oneOf/0/properties/dashboardEditConfirmation/type",
          keyword: "type",
          params: {
            type: schema20.oneOf[0].properties.dashboardEditConfirmation.type,
          },
          message: "must be boolean,null",
        };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    if (data.deploymentType !== undefined) {
      let data4 = data.deploymentType;
      if (typeof data4 !== "string") {
        const err18 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
      if (
        !(
          data4 === "dev" ||
          data4 === "prod" ||
          data4 === "preview" ||
          data4 === "custom"
        )
      ) {
        const err19 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/enum",
          keyword: "enum",
          params: { allowedValues: schema22.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
    }
    if (data.deploymentUrl !== undefined) {
      if (typeof data.deploymentUrl !== "string") {
        const err20 = {
          instancePath: instancePath + "/deploymentUrl",
          schemaPath: "#/oneOf/0/properties/deploymentUrl/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
    }
    if (data.expiresAt !== undefined) {
      let data6 = data.expiresAt;
      if (
        !(typeof data6 == "number" && !(data6 % 1) && !isNaN(data6)) &&
        data6 !== null
      ) {
        const err21 = {
          instancePath: instancePath + "/expiresAt",
          schemaPath: "#/oneOf/0/properties/expiresAt/type",
          keyword: "type",
          params: { type: schema20.oneOf[0].properties.expiresAt.type },
          message: "must be integer,null",
        };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      let data7 = data.id;
      if (!(typeof data7 == "number" && !(data7 % 1) && !isNaN(data7))) {
        const err22 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/DeploymentId/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
      if (typeof data7 == "number") {
        if (data7 < 0 || isNaN(data7)) {
          const err23 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/DeploymentId/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
    }
    if (data.isDefault !== undefined) {
      if (typeof data.isDefault !== "boolean") {
        const err24 = {
          instancePath: instancePath + "/isDefault",
          schemaPath: "#/components/schemas/IsDefaultDeployment/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
        };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      let data9 = data.kind;
      if (typeof data9 !== "string") {
        const err25 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/0/properties/kind/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
      if (!(data9 === "cloud")) {
        const err26 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/0/properties/kind/enum",
          keyword: "enum",
          params: { allowedValues: schema20.oneOf[0].properties.kind.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
        }
        errors++;
      }
    }
    if (data.lastDeployTime !== undefined) {
      let data10 = data.lastDeployTime;
      if (
        !(typeof data10 == "number" && !(data10 % 1) && !isNaN(data10)) &&
        data10 !== null
      ) {
        const err27 = {
          instancePath: instancePath + "/lastDeployTime",
          schemaPath: "#/oneOf/0/properties/lastDeployTime/type",
          keyword: "type",
          params: { type: schema20.oneOf[0].properties.lastDeployTime.type },
          message: "must be integer,null",
        };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err28 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/oneOf/0/properties/name/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err28];
        } else {
          vErrors.push(err28);
        }
        errors++;
      }
    }
    if (data.previewIdentifier !== undefined) {
      let data12 = data.previewIdentifier;
      const _errs36 = errors;
      let valid7 = false;
      let passing2 = null;
      const _errs37 = errors;
      if (data12 !== null) {
        const err29 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/0/properties/previewIdentifier/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err29];
        } else {
          vErrors.push(err29);
        }
        errors++;
      }
      var _valid2 = _errs37 === errors;
      if (_valid2) {
        valid7 = true;
        passing2 = 0;
      }
      const _errs39 = errors;
      if (typeof data12 !== "string") {
        const err30 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/components/schemas/PreviewDeploymentIdentifier/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err30];
        } else {
          vErrors.push(err30);
        }
        errors++;
      }
      var _valid2 = _errs39 === errors;
      if (_valid2 && valid7) {
        valid7 = false;
        passing2 = [passing2, 1];
      } else {
        if (_valid2) {
          valid7 = true;
          passing2 = 1;
        }
      }
      if (!valid7) {
        const err31 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/0/properties/previewIdentifier/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing2 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      } else {
        errors = _errs36;
        if (vErrors !== null) {
          if (_errs36) {
            vErrors.length = _errs36;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.projectId !== undefined) {
      let data13 = data.projectId;
      if (!(typeof data13 == "number" && !(data13 % 1) && !isNaN(data13))) {
        const err32 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err32];
        } else {
          vErrors.push(err32);
        }
        errors++;
      }
      if (typeof data13 == "number") {
        if (data13 < 0 || isNaN(data13)) {
          const err33 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err33];
          } else {
            vErrors.push(err33);
          }
          errors++;
        }
      }
    }
    if (data.reference !== undefined) {
      if (typeof data.reference !== "string") {
        const err34 = {
          instancePath: instancePath + "/reference",
          schemaPath: "#/components/schemas/DeploymentReference/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err34];
        } else {
          vErrors.push(err34);
        }
        errors++;
      }
    }
    if (data.region !== undefined) {
      let data15 = data.region;
      if (typeof data15 !== "string") {
        const err35 = {
          instancePath: instancePath + "/region",
          schemaPath: "#/components/schemas/RegionName/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err35];
        } else {
          vErrors.push(err35);
        }
        errors++;
      }
      if (!(data15 === "aws-us-east-1" || data15 === "aws-eu-west-1")) {
        const err36 = {
          instancePath: instancePath + "/region",
          schemaPath: "#/components/schemas/RegionName/enum",
          keyword: "enum",
          params: { allowedValues: schema28.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err36];
        } else {
          vErrors.push(err36);
        }
        errors++;
      }
    }
    if (data.sendLogsToClient !== undefined) {
      let data16 = data.sendLogsToClient;
      if (typeof data16 !== "boolean" && data16 !== null) {
        const err37 = {
          instancePath: instancePath + "/sendLogsToClient",
          schemaPath: "#/oneOf/0/properties/sendLogsToClient/type",
          keyword: "type",
          params: { type: schema20.oneOf[0].properties.sendLogsToClient.type },
          message: "must be boolean,null",
        };
        if (vErrors === null) {
          vErrors = [err37];
        } else {
          vErrors.push(err37);
        }
        errors++;
      }
    }
  } else {
    const err38 = {
      instancePath,
      schemaPath: "#/oneOf/0/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err38];
    } else {
      vErrors.push(err38);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
    var props0 = {};
    props0.class = true;
    props0.createTime = true;
    props0.creator = true;
    props0.dashboardEditConfirmation = true;
    props0.deploymentType = true;
    props0.deploymentUrl = true;
    props0.expiresAt = true;
    props0.id = true;
    props0.isDefault = true;
    props0.kind = true;
    props0.lastDeployTime = true;
    props0.name = true;
    props0.previewIdentifier = true;
    props0.projectId = true;
    props0.reference = true;
    props0.region = true;
    props0.sendLogsToClient = true;
  }
  const _errs53 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.name === undefined) {
      const err39 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "name" },
        message: "must have required property '" + "name" + "'",
      };
      if (vErrors === null) {
        vErrors = [err39];
      } else {
        vErrors.push(err39);
      }
      errors++;
    }
    if (data.createTime === undefined) {
      const err40 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "createTime" },
        message: "must have required property '" + "createTime" + "'",
      };
      if (vErrors === null) {
        vErrors = [err40];
      } else {
        vErrors.push(err40);
      }
      errors++;
    }
    if (data.deploymentType === undefined) {
      const err41 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "deploymentType" },
        message: "must have required property '" + "deploymentType" + "'",
      };
      if (vErrors === null) {
        vErrors = [err41];
      } else {
        vErrors.push(err41);
      }
      errors++;
    }
    if (data.projectId === undefined) {
      const err42 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "projectId" },
        message: "must have required property '" + "projectId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err42];
      } else {
        vErrors.push(err42);
      }
      errors++;
    }
    if (data.creator === undefined) {
      const err43 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "creator" },
        message: "must have required property '" + "creator" + "'",
      };
      if (vErrors === null) {
        vErrors = [err43];
      } else {
        vErrors.push(err43);
      }
      errors++;
    }
    if (data.port === undefined) {
      const err44 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "port" },
        message: "must have required property '" + "port" + "'",
      };
      if (vErrors === null) {
        vErrors = [err44];
      } else {
        vErrors.push(err44);
      }
      errors++;
    }
    if (data.deviceName === undefined) {
      const err45 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "deviceName" },
        message: "must have required property '" + "deviceName" + "'",
      };
      if (vErrors === null) {
        vErrors = [err45];
      } else {
        vErrors.push(err45);
      }
      errors++;
    }
    if (data.isActive === undefined) {
      const err46 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "isActive" },
        message: "must have required property '" + "isActive" + "'",
      };
      if (vErrors === null) {
        vErrors = [err46];
      } else {
        vErrors.push(err46);
      }
      errors++;
    }
    if (data.kind === undefined) {
      const err47 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "kind" },
        message: "must have required property '" + "kind" + "'",
      };
      if (vErrors === null) {
        vErrors = [err47];
      } else {
        vErrors.push(err47);
      }
      errors++;
    }
    if (data.createTime !== undefined) {
      let data17 = data.createTime;
      if (!(typeof data17 == "number" && !(data17 % 1) && !isNaN(data17))) {
        const err48 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/oneOf/1/properties/createTime/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err48];
        } else {
          vErrors.push(err48);
        }
        errors++;
      }
    }
    if (data.creator !== undefined) {
      let data18 = data.creator;
      if (!(typeof data18 == "number" && !(data18 % 1) && !isNaN(data18))) {
        const err49 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err49];
        } else {
          vErrors.push(err49);
        }
        errors++;
      }
      if (typeof data18 == "number") {
        if (data18 < 0 || isNaN(data18)) {
          const err50 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err50];
          } else {
            vErrors.push(err50);
          }
          errors++;
        }
      }
    }
    if (data.deploymentType !== undefined) {
      let data19 = data.deploymentType;
      if (typeof data19 !== "string") {
        const err51 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err51];
        } else {
          vErrors.push(err51);
        }
        errors++;
      }
      if (
        !(
          data19 === "dev" ||
          data19 === "prod" ||
          data19 === "preview" ||
          data19 === "custom"
        )
      ) {
        const err52 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/enum",
          keyword: "enum",
          params: { allowedValues: schema22.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err52];
        } else {
          vErrors.push(err52);
        }
        errors++;
      }
    }
    if (data.deviceName !== undefined) {
      if (typeof data.deviceName !== "string") {
        const err53 = {
          instancePath: instancePath + "/deviceName",
          schemaPath: "#/components/schemas/DeviceName/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err53];
        } else {
          vErrors.push(err53);
        }
        errors++;
      }
    }
    if (data.isActive !== undefined) {
      if (typeof data.isActive !== "boolean") {
        const err54 = {
          instancePath: instancePath + "/isActive",
          schemaPath: "#/oneOf/1/properties/isActive/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
        };
        if (vErrors === null) {
          vErrors = [err54];
        } else {
          vErrors.push(err54);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      let data22 = data.kind;
      if (typeof data22 !== "string") {
        const err55 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/1/properties/kind/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err55];
        } else {
          vErrors.push(err55);
        }
        errors++;
      }
      if (!(data22 === "local")) {
        const err56 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/1/properties/kind/enum",
          keyword: "enum",
          params: { allowedValues: schema20.oneOf[1].properties.kind.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err56];
        } else {
          vErrors.push(err56);
        }
        errors++;
      }
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err57 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/oneOf/1/properties/name/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err57];
        } else {
          vErrors.push(err57);
        }
        errors++;
      }
    }
    if (data.port !== undefined) {
      let data24 = data.port;
      if (!(typeof data24 == "number" && !(data24 % 1) && !isNaN(data24))) {
        const err58 = {
          instancePath: instancePath + "/port",
          schemaPath: "#/oneOf/1/properties/port/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err58];
        } else {
          vErrors.push(err58);
        }
        errors++;
      }
      if (typeof data24 == "number") {
        if (data24 < 0 || isNaN(data24)) {
          const err59 = {
            instancePath: instancePath + "/port",
            schemaPath: "#/oneOf/1/properties/port/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err59];
          } else {
            vErrors.push(err59);
          }
          errors++;
        }
      }
    }
    if (data.previewIdentifier !== undefined) {
      let data25 = data.previewIdentifier;
      const _errs75 = errors;
      let valid16 = false;
      let passing3 = null;
      const _errs76 = errors;
      if (data25 !== null) {
        const err60 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/1/properties/previewIdentifier/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err60];
        } else {
          vErrors.push(err60);
        }
        errors++;
      }
      var _valid3 = _errs76 === errors;
      if (_valid3) {
        valid16 = true;
        passing3 = 0;
      }
      const _errs78 = errors;
      if (typeof data25 !== "string") {
        const err61 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/components/schemas/PreviewDeploymentIdentifier/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err61];
        } else {
          vErrors.push(err61);
        }
        errors++;
      }
      var _valid3 = _errs78 === errors;
      if (_valid3 && valid16) {
        valid16 = false;
        passing3 = [passing3, 1];
      } else {
        if (_valid3) {
          valid16 = true;
          passing3 = 1;
        }
      }
      if (!valid16) {
        const err62 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/1/properties/previewIdentifier/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing3 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err62];
        } else {
          vErrors.push(err62);
        }
        errors++;
      } else {
        errors = _errs75;
        if (vErrors !== null) {
          if (_errs75) {
            vErrors.length = _errs75;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.projectId !== undefined) {
      let data26 = data.projectId;
      if (!(typeof data26 == "number" && !(data26 % 1) && !isNaN(data26))) {
        const err63 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err63];
        } else {
          vErrors.push(err63);
        }
        errors++;
      }
      if (typeof data26 == "number") {
        if (data26 < 0 || isNaN(data26)) {
          const err64 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err64];
          } else {
            vErrors.push(err64);
          }
          errors++;
        }
      }
    }
  } else {
    const err65 = {
      instancePath,
      schemaPath: "#/oneOf/1/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err65];
    } else {
      vErrors.push(err65);
    }
    errors++;
  }
  var _valid0 = _errs53 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
      if (props0 !== true) {
        props0 = props0 || {};
        props0.createTime = true;
        props0.creator = true;
        props0.deploymentType = true;
        props0.deviceName = true;
        props0.isActive = true;
        props0.kind = true;
        props0.name = true;
        props0.port = true;
        props0.previewIdentifier = true;
        props0.projectId = true;
      }
    }
  }
  if (!valid0) {
    const err66 = {
      instancePath,
      schemaPath: "#/oneOf",
      keyword: "oneOf",
      params: { passingSchemas: passing0 },
      message: "must match exactly one schema in oneOf",
    };
    if (vErrors === null) {
      vErrors = [err66];
    } else {
      vErrors.push(err66);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate11.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate11.evaluated = { dynamicProps: true, dynamicItems: false };
function validate10(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate10.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate11(data, {
      instancePath,
      parentData,
      parentDataProperty,
      rootData,
      dynamicAnchors,
    })
  ) {
    vErrors =
      vErrors === null ? validate11.errors : vErrors.concat(validate11.errors);
    errors = vErrors.length;
  } else {
    var props0 = validate11.evaluated.props;
  }
  validate10.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate10.evaluated = { dynamicProps: true, dynamicItems: false };
export const ajvPlatformDeploymentResponseList = validate13;
const schema34 = {
  type: "array",
  items: {
    $ref: "https://api.convex.dev/v1/openapi.json#/components/schemas/PlatformDeploymentResponse",
  },
};
function validate14(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate14.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "id" },
        message: "must have required property '" + "id" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.name === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "name" },
        message: "must have required property '" + "name" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.createTime === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "createTime" },
        message: "must have required property '" + "createTime" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.deploymentType === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "deploymentType" },
        message: "must have required property '" + "deploymentType" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.projectId === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "projectId" },
        message: "must have required property '" + "projectId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.region === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "region" },
        message: "must have required property '" + "region" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.isDefault === undefined) {
      const err6 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "isDefault" },
        message: "must have required property '" + "isDefault" + "'",
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.reference === undefined) {
      const err7 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "reference" },
        message: "must have required property '" + "reference" + "'",
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.deploymentUrl === undefined) {
      const err8 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "deploymentUrl" },
        message: "must have required property '" + "deploymentUrl" + "'",
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    if (data.class === undefined) {
      const err9 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "class" },
        message: "must have required property '" + "class" + "'",
      };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
    if (data.kind === undefined) {
      const err10 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "kind" },
        message: "must have required property '" + "kind" + "'",
      };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    if (data.class !== undefined) {
      if (typeof data.class !== "string") {
        const err11 = {
          instancePath: instancePath + "/class",
          schemaPath: "#/oneOf/0/properties/class/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.createTime !== undefined) {
      let data1 = data.createTime;
      if (!(typeof data1 == "number" && !(data1 % 1) && !isNaN(data1))) {
        const err12 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/oneOf/0/properties/createTime/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.creator !== undefined) {
      let data2 = data.creator;
      const _errs8 = errors;
      let valid2 = false;
      let passing1 = null;
      const _errs9 = errors;
      if (data2 !== null) {
        const err13 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/oneOf/0/properties/creator/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
      var _valid1 = _errs9 === errors;
      if (_valid1) {
        valid2 = true;
        passing1 = 0;
      }
      const _errs11 = errors;
      if (!(typeof data2 == "number" && !(data2 % 1) && !isNaN(data2))) {
        const err14 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
      if (typeof data2 == "number") {
        if (data2 < 0 || isNaN(data2)) {
          const err15 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
      }
      var _valid1 = _errs11 === errors;
      if (_valid1 && valid2) {
        valid2 = false;
        passing1 = [passing1, 1];
      } else {
        if (_valid1) {
          valid2 = true;
          passing1 = 1;
        }
      }
      if (!valid2) {
        const err16 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/oneOf/0/properties/creator/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing1 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      } else {
        errors = _errs8;
        if (vErrors !== null) {
          if (_errs8) {
            vErrors.length = _errs8;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.dashboardEditConfirmation !== undefined) {
      let data3 = data.dashboardEditConfirmation;
      if (typeof data3 !== "boolean" && data3 !== null) {
        const err17 = {
          instancePath: instancePath + "/dashboardEditConfirmation",
          schemaPath: "#/oneOf/0/properties/dashboardEditConfirmation/type",
          keyword: "type",
          params: {
            type: schema20.oneOf[0].properties.dashboardEditConfirmation.type,
          },
          message: "must be boolean,null",
        };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    if (data.deploymentType !== undefined) {
      let data4 = data.deploymentType;
      if (typeof data4 !== "string") {
        const err18 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
      if (
        !(
          data4 === "dev" ||
          data4 === "prod" ||
          data4 === "preview" ||
          data4 === "custom"
        )
      ) {
        const err19 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/enum",
          keyword: "enum",
          params: { allowedValues: schema22.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
    }
    if (data.deploymentUrl !== undefined) {
      if (typeof data.deploymentUrl !== "string") {
        const err20 = {
          instancePath: instancePath + "/deploymentUrl",
          schemaPath: "#/oneOf/0/properties/deploymentUrl/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
    }
    if (data.expiresAt !== undefined) {
      let data6 = data.expiresAt;
      if (
        !(typeof data6 == "number" && !(data6 % 1) && !isNaN(data6)) &&
        data6 !== null
      ) {
        const err21 = {
          instancePath: instancePath + "/expiresAt",
          schemaPath: "#/oneOf/0/properties/expiresAt/type",
          keyword: "type",
          params: { type: schema20.oneOf[0].properties.expiresAt.type },
          message: "must be integer,null",
        };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      let data7 = data.id;
      if (!(typeof data7 == "number" && !(data7 % 1) && !isNaN(data7))) {
        const err22 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/DeploymentId/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
      if (typeof data7 == "number") {
        if (data7 < 0 || isNaN(data7)) {
          const err23 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/DeploymentId/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
    }
    if (data.isDefault !== undefined) {
      if (typeof data.isDefault !== "boolean") {
        const err24 = {
          instancePath: instancePath + "/isDefault",
          schemaPath: "#/components/schemas/IsDefaultDeployment/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
        };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      let data9 = data.kind;
      if (typeof data9 !== "string") {
        const err25 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/0/properties/kind/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
      if (!(data9 === "cloud")) {
        const err26 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/0/properties/kind/enum",
          keyword: "enum",
          params: { allowedValues: schema20.oneOf[0].properties.kind.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
        }
        errors++;
      }
    }
    if (data.lastDeployTime !== undefined) {
      let data10 = data.lastDeployTime;
      if (
        !(typeof data10 == "number" && !(data10 % 1) && !isNaN(data10)) &&
        data10 !== null
      ) {
        const err27 = {
          instancePath: instancePath + "/lastDeployTime",
          schemaPath: "#/oneOf/0/properties/lastDeployTime/type",
          keyword: "type",
          params: { type: schema20.oneOf[0].properties.lastDeployTime.type },
          message: "must be integer,null",
        };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err28 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/oneOf/0/properties/name/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err28];
        } else {
          vErrors.push(err28);
        }
        errors++;
      }
    }
    if (data.previewIdentifier !== undefined) {
      let data12 = data.previewIdentifier;
      const _errs36 = errors;
      let valid7 = false;
      let passing2 = null;
      const _errs37 = errors;
      if (data12 !== null) {
        const err29 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/0/properties/previewIdentifier/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err29];
        } else {
          vErrors.push(err29);
        }
        errors++;
      }
      var _valid2 = _errs37 === errors;
      if (_valid2) {
        valid7 = true;
        passing2 = 0;
      }
      const _errs39 = errors;
      if (typeof data12 !== "string") {
        const err30 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/components/schemas/PreviewDeploymentIdentifier/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err30];
        } else {
          vErrors.push(err30);
        }
        errors++;
      }
      var _valid2 = _errs39 === errors;
      if (_valid2 && valid7) {
        valid7 = false;
        passing2 = [passing2, 1];
      } else {
        if (_valid2) {
          valid7 = true;
          passing2 = 1;
        }
      }
      if (!valid7) {
        const err31 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/0/properties/previewIdentifier/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing2 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      } else {
        errors = _errs36;
        if (vErrors !== null) {
          if (_errs36) {
            vErrors.length = _errs36;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.projectId !== undefined) {
      let data13 = data.projectId;
      if (!(typeof data13 == "number" && !(data13 % 1) && !isNaN(data13))) {
        const err32 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err32];
        } else {
          vErrors.push(err32);
        }
        errors++;
      }
      if (typeof data13 == "number") {
        if (data13 < 0 || isNaN(data13)) {
          const err33 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err33];
          } else {
            vErrors.push(err33);
          }
          errors++;
        }
      }
    }
    if (data.reference !== undefined) {
      if (typeof data.reference !== "string") {
        const err34 = {
          instancePath: instancePath + "/reference",
          schemaPath: "#/components/schemas/DeploymentReference/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err34];
        } else {
          vErrors.push(err34);
        }
        errors++;
      }
    }
    if (data.region !== undefined) {
      let data15 = data.region;
      if (typeof data15 !== "string") {
        const err35 = {
          instancePath: instancePath + "/region",
          schemaPath: "#/components/schemas/RegionName/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err35];
        } else {
          vErrors.push(err35);
        }
        errors++;
      }
      if (!(data15 === "aws-us-east-1" || data15 === "aws-eu-west-1")) {
        const err36 = {
          instancePath: instancePath + "/region",
          schemaPath: "#/components/schemas/RegionName/enum",
          keyword: "enum",
          params: { allowedValues: schema28.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err36];
        } else {
          vErrors.push(err36);
        }
        errors++;
      }
    }
    if (data.sendLogsToClient !== undefined) {
      let data16 = data.sendLogsToClient;
      if (typeof data16 !== "boolean" && data16 !== null) {
        const err37 = {
          instancePath: instancePath + "/sendLogsToClient",
          schemaPath: "#/oneOf/0/properties/sendLogsToClient/type",
          keyword: "type",
          params: { type: schema20.oneOf[0].properties.sendLogsToClient.type },
          message: "must be boolean,null",
        };
        if (vErrors === null) {
          vErrors = [err37];
        } else {
          vErrors.push(err37);
        }
        errors++;
      }
    }
  } else {
    const err38 = {
      instancePath,
      schemaPath: "#/oneOf/0/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err38];
    } else {
      vErrors.push(err38);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
    var props0 = {};
    props0.class = true;
    props0.createTime = true;
    props0.creator = true;
    props0.dashboardEditConfirmation = true;
    props0.deploymentType = true;
    props0.deploymentUrl = true;
    props0.expiresAt = true;
    props0.id = true;
    props0.isDefault = true;
    props0.kind = true;
    props0.lastDeployTime = true;
    props0.name = true;
    props0.previewIdentifier = true;
    props0.projectId = true;
    props0.reference = true;
    props0.region = true;
    props0.sendLogsToClient = true;
  }
  const _errs53 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.name === undefined) {
      const err39 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "name" },
        message: "must have required property '" + "name" + "'",
      };
      if (vErrors === null) {
        vErrors = [err39];
      } else {
        vErrors.push(err39);
      }
      errors++;
    }
    if (data.createTime === undefined) {
      const err40 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "createTime" },
        message: "must have required property '" + "createTime" + "'",
      };
      if (vErrors === null) {
        vErrors = [err40];
      } else {
        vErrors.push(err40);
      }
      errors++;
    }
    if (data.deploymentType === undefined) {
      const err41 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "deploymentType" },
        message: "must have required property '" + "deploymentType" + "'",
      };
      if (vErrors === null) {
        vErrors = [err41];
      } else {
        vErrors.push(err41);
      }
      errors++;
    }
    if (data.projectId === undefined) {
      const err42 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "projectId" },
        message: "must have required property '" + "projectId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err42];
      } else {
        vErrors.push(err42);
      }
      errors++;
    }
    if (data.creator === undefined) {
      const err43 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "creator" },
        message: "must have required property '" + "creator" + "'",
      };
      if (vErrors === null) {
        vErrors = [err43];
      } else {
        vErrors.push(err43);
      }
      errors++;
    }
    if (data.port === undefined) {
      const err44 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "port" },
        message: "must have required property '" + "port" + "'",
      };
      if (vErrors === null) {
        vErrors = [err44];
      } else {
        vErrors.push(err44);
      }
      errors++;
    }
    if (data.deviceName === undefined) {
      const err45 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "deviceName" },
        message: "must have required property '" + "deviceName" + "'",
      };
      if (vErrors === null) {
        vErrors = [err45];
      } else {
        vErrors.push(err45);
      }
      errors++;
    }
    if (data.isActive === undefined) {
      const err46 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "isActive" },
        message: "must have required property '" + "isActive" + "'",
      };
      if (vErrors === null) {
        vErrors = [err46];
      } else {
        vErrors.push(err46);
      }
      errors++;
    }
    if (data.kind === undefined) {
      const err47 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "kind" },
        message: "must have required property '" + "kind" + "'",
      };
      if (vErrors === null) {
        vErrors = [err47];
      } else {
        vErrors.push(err47);
      }
      errors++;
    }
    if (data.createTime !== undefined) {
      let data17 = data.createTime;
      if (!(typeof data17 == "number" && !(data17 % 1) && !isNaN(data17))) {
        const err48 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/oneOf/1/properties/createTime/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err48];
        } else {
          vErrors.push(err48);
        }
        errors++;
      }
    }
    if (data.creator !== undefined) {
      let data18 = data.creator;
      if (!(typeof data18 == "number" && !(data18 % 1) && !isNaN(data18))) {
        const err49 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err49];
        } else {
          vErrors.push(err49);
        }
        errors++;
      }
      if (typeof data18 == "number") {
        if (data18 < 0 || isNaN(data18)) {
          const err50 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err50];
          } else {
            vErrors.push(err50);
          }
          errors++;
        }
      }
    }
    if (data.deploymentType !== undefined) {
      let data19 = data.deploymentType;
      if (typeof data19 !== "string") {
        const err51 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err51];
        } else {
          vErrors.push(err51);
        }
        errors++;
      }
      if (
        !(
          data19 === "dev" ||
          data19 === "prod" ||
          data19 === "preview" ||
          data19 === "custom"
        )
      ) {
        const err52 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/enum",
          keyword: "enum",
          params: { allowedValues: schema22.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err52];
        } else {
          vErrors.push(err52);
        }
        errors++;
      }
    }
    if (data.deviceName !== undefined) {
      if (typeof data.deviceName !== "string") {
        const err53 = {
          instancePath: instancePath + "/deviceName",
          schemaPath: "#/components/schemas/DeviceName/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err53];
        } else {
          vErrors.push(err53);
        }
        errors++;
      }
    }
    if (data.isActive !== undefined) {
      if (typeof data.isActive !== "boolean") {
        const err54 = {
          instancePath: instancePath + "/isActive",
          schemaPath: "#/oneOf/1/properties/isActive/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
        };
        if (vErrors === null) {
          vErrors = [err54];
        } else {
          vErrors.push(err54);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      let data22 = data.kind;
      if (typeof data22 !== "string") {
        const err55 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/1/properties/kind/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err55];
        } else {
          vErrors.push(err55);
        }
        errors++;
      }
      if (!(data22 === "local")) {
        const err56 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/1/properties/kind/enum",
          keyword: "enum",
          params: { allowedValues: schema20.oneOf[1].properties.kind.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err56];
        } else {
          vErrors.push(err56);
        }
        errors++;
      }
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err57 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/oneOf/1/properties/name/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err57];
        } else {
          vErrors.push(err57);
        }
        errors++;
      }
    }
    if (data.port !== undefined) {
      let data24 = data.port;
      if (!(typeof data24 == "number" && !(data24 % 1) && !isNaN(data24))) {
        const err58 = {
          instancePath: instancePath + "/port",
          schemaPath: "#/oneOf/1/properties/port/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err58];
        } else {
          vErrors.push(err58);
        }
        errors++;
      }
      if (typeof data24 == "number") {
        if (data24 < 0 || isNaN(data24)) {
          const err59 = {
            instancePath: instancePath + "/port",
            schemaPath: "#/oneOf/1/properties/port/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err59];
          } else {
            vErrors.push(err59);
          }
          errors++;
        }
      }
    }
    if (data.previewIdentifier !== undefined) {
      let data25 = data.previewIdentifier;
      const _errs75 = errors;
      let valid16 = false;
      let passing3 = null;
      const _errs76 = errors;
      if (data25 !== null) {
        const err60 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/1/properties/previewIdentifier/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err60];
        } else {
          vErrors.push(err60);
        }
        errors++;
      }
      var _valid3 = _errs76 === errors;
      if (_valid3) {
        valid16 = true;
        passing3 = 0;
      }
      const _errs78 = errors;
      if (typeof data25 !== "string") {
        const err61 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/components/schemas/PreviewDeploymentIdentifier/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err61];
        } else {
          vErrors.push(err61);
        }
        errors++;
      }
      var _valid3 = _errs78 === errors;
      if (_valid3 && valid16) {
        valid16 = false;
        passing3 = [passing3, 1];
      } else {
        if (_valid3) {
          valid16 = true;
          passing3 = 1;
        }
      }
      if (!valid16) {
        const err62 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/1/properties/previewIdentifier/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing3 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err62];
        } else {
          vErrors.push(err62);
        }
        errors++;
      } else {
        errors = _errs75;
        if (vErrors !== null) {
          if (_errs75) {
            vErrors.length = _errs75;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.projectId !== undefined) {
      let data26 = data.projectId;
      if (!(typeof data26 == "number" && !(data26 % 1) && !isNaN(data26))) {
        const err63 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err63];
        } else {
          vErrors.push(err63);
        }
        errors++;
      }
      if (typeof data26 == "number") {
        if (data26 < 0 || isNaN(data26)) {
          const err64 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err64];
          } else {
            vErrors.push(err64);
          }
          errors++;
        }
      }
    }
  } else {
    const err65 = {
      instancePath,
      schemaPath: "#/oneOf/1/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err65];
    } else {
      vErrors.push(err65);
    }
    errors++;
  }
  var _valid0 = _errs53 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
      if (props0 !== true) {
        props0 = props0 || {};
        props0.createTime = true;
        props0.creator = true;
        props0.deploymentType = true;
        props0.deviceName = true;
        props0.isActive = true;
        props0.kind = true;
        props0.name = true;
        props0.port = true;
        props0.previewIdentifier = true;
        props0.projectId = true;
      }
    }
  }
  if (!valid0) {
    const err66 = {
      instancePath,
      schemaPath: "#/oneOf",
      keyword: "oneOf",
      params: { passingSchemas: passing0 },
      message: "must match exactly one schema in oneOf",
    };
    if (vErrors === null) {
      vErrors = [err66];
    } else {
      vErrors.push(err66);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate14.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate14.evaluated = { dynamicProps: true, dynamicItems: false };
function validate13(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate13.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (Array.isArray(data)) {
    const len0 = data.length;
    for (let i0 = 0; i0 < len0; i0++) {
      if (
        !validate14(data[i0], {
          instancePath: instancePath + "/" + i0,
          parentData: data,
          parentDataProperty: i0,
          rootData,
          dynamicAnchors,
        })
      ) {
        vErrors =
          vErrors === null
            ? validate14.errors
            : vErrors.concat(validate14.errors);
        errors = vErrors.length;
      }
    }
  } else {
    const err0 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "array" },
      message: "must be array",
    };
    if (vErrors === null) {
      vErrors = [err0];
    } else {
      vErrors.push(err0);
    }
    errors++;
  }
  validate13.errors = vErrors;
  return errors === 0;
}
validate13.evaluated = {
  items: true,
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvPlatformCreateDeployKeyResponse = validate16;
const schema49 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/components/schemas/PlatformCreateDeployKeyResponse",
};
const schema50 = {
  type: "object",
  required: ["deployKey"],
  properties: {
    deployKey: {
      $ref: "#/components/schemas/AdminKey",
      description: "The generated deploy key.",
    },
  },
};
const schema51 = { type: "string", description: "Encrypted admin key" };
function validate17(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate17.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.deployKey === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "deployKey" },
        message: "must have required property '" + "deployKey" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.deployKey !== undefined) {
      if (typeof data.deployKey !== "string") {
        const err1 = {
          instancePath: instancePath + "/deployKey",
          schemaPath: "#/components/schemas/AdminKey/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
  } else {
    const err2 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err2];
    } else {
      vErrors.push(err2);
    }
    errors++;
  }
  validate17.errors = vErrors;
  return errors === 0;
}
validate17.evaluated = {
  props: { deployKey: true },
  dynamicProps: false,
  dynamicItems: false,
};
function validate16(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate16.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate17(data, {
      instancePath,
      parentData,
      parentDataProperty,
      rootData,
      dynamicAnchors,
    })
  ) {
    vErrors =
      vErrors === null ? validate17.errors : vErrors.concat(validate17.errors);
    errors = vErrors.length;
  }
  validate16.errors = vErrors;
  return errors === 0;
}
validate16.evaluated = {
  props: { deployKey: true },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvConvexOAuthTokenResponse = validate19;
const schema52 = {
  type: "object",
  additionalProperties: true,
  required: ["access_token", "token_type"],
  properties: {
    access_token: { type: "string", pattern: "^.+$" },
    token_type: { const: "bearer" },
  },
};
const pattern0 = new RegExp("^.+$", "u");
function validate19(
  data,
  {
    instancePath = "",
    parentData,
    parentDataProperty,
    rootData = data,
    dynamicAnchors = {},
  } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate19.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.access_token === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "access_token" },
        message: "must have required property '" + "access_token" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.token_type === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "token_type" },
        message: "must have required property '" + "token_type" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.access_token !== undefined) {
      let data0 = data.access_token;
      if (typeof data0 === "string") {
        if (!pattern0.test(data0)) {
          const err2 = {
            instancePath: instancePath + "/access_token",
            schemaPath: "#/properties/access_token/pattern",
            keyword: "pattern",
            params: { pattern: "^.+$" },
            message: 'must match pattern "' + "^.+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      } else {
        const err3 = {
          instancePath: instancePath + "/access_token",
          schemaPath: "#/properties/access_token/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.token_type !== undefined) {
      if ("bearer" !== data.token_type) {
        const err4 = {
          instancePath: instancePath + "/token_type",
          schemaPath: "#/properties/token_type/const",
          keyword: "const",
          params: { allowedValue: "bearer" },
          message: "must be equal to constant",
        };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
  } else {
    const err5 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err5];
    } else {
      vErrors.push(err5);
    }
    errors++;
  }
  validate19.errors = vErrors;
  return errors === 0;
}
validate19.evaluated = {
  props: true,
  dynamicProps: false,
  dynamicItems: false,
};
