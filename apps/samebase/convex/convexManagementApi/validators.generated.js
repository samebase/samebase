// Generated from https://api.convex.dev/v1/openapi.json. Do not edit by hand.
/* eslint-disable */

"use strict";
export const ajvCreateProjectResponse = validate0;
const schema0 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1create_project/post/responses/200/content/application~1json/schema",
};
const schema2 = {
  type: "object",
  required: ["projectId", "id", "slug"],
  properties: {
    projectId: {
      $ref: "#/components/schemas/ProjectId",
      description: "Deprecated alias for `id`, kept for backwards compatibility.",
    },
    id: { $ref: "#/components/schemas/ProjectId" },
    slug: {
      $ref: "#/components/schemas/ProjectSlug",
      description: "The shortened version of the project name used in Convex Dashboard URLs.",
    },
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
  },
};
const schema3 = { pattern: "^[0-9]+$", type: "string" };
const schema5 = { type: "string" };
const pattern0 = new RegExp("^[0-9]+$", "u");
function validate2(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
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
    if (data.projectId !== undefined) {
      let data0 = data.projectId;
      if (typeof data0 === "string") {
        if (!pattern0.test(data0)) {
          const err3 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      } else {
        const err4 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
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
      let data1 = data.id;
      if (typeof data1 === "string") {
        if (!pattern0.test(data1)) {
          const err5 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      } else {
        const err6 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.slug !== undefined) {
      if (typeof data.slug !== "string") {
        const err7 = {
          instancePath: instancePath + "/slug",
          schemaPath: "#/components/schemas/ProjectSlug/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.deploymentName !== undefined) {
      let data3 = data.deploymentName;
      if (typeof data3 !== "string" && data3 !== null) {
        const err8 = {
          instancePath: instancePath + "/deploymentName",
          schemaPath: "#/properties/deploymentName/type",
          keyword: "type",
          params: { type: schema2.properties.deploymentName.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.deploymentUrl !== undefined) {
      let data4 = data.deploymentUrl;
      if (typeof data4 !== "string" && data4 !== null) {
        const err9 = {
          instancePath: instancePath + "/deploymentUrl",
          schemaPath: "#/properties/deploymentUrl/type",
          keyword: "type",
          params: { type: schema2.properties.deploymentUrl.type },
          message: "must be string,null",
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
  validate2.errors = vErrors;
  return errors === 0;
}
validate2.evaluated = {
  props: { projectId: true, id: true, slug: true, deploymentName: true, deploymentUrl: true },
  dynamicProps: false,
  dynamicItems: false,
};
function validate0(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
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
    !validate2(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate2.errors : vErrors.concat(validate2.errors);
    errors = vErrors.length;
  }
  validate0.errors = vErrors;
  return errors === 0;
}
validate0.evaluated = {
  props: { projectId: true, id: true, slug: true, deploymentName: true, deploymentUrl: true },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvGetProjectByIdResponse = validate4;
const schema6 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1projects~1{project_id}/get/responses/200/content/application~1json/schema",
};
const schema7 = {
  type: "object",
  required: ["id", "name", "slug", "teamId", "teamSlug", "createTime"],
  properties: {
    id: { $ref: "#/components/schemas/ProjectId" },
    name: {
      $ref: "#/components/schemas/ProjectName",
      description: "The full project name, including spaces and punctuation.",
    },
    slug: {
      $ref: "#/components/schemas/ProjectSlug",
      description: "This shortened version of the name used in Convex Dashboard URLs.",
    },
    teamId: { $ref: "#/components/schemas/TeamId" },
    teamSlug: {
      $ref: "#/components/schemas/TeamSlug",
      description: "The slug of the team that owns this project.",
    },
    createTime: { type: "integer", format: "int64", description: "Timestamp in milliseconds." },
    prodDeploymentName: {
      type: ["string", "null"],
      description:
        'The name of the default production deployment for this project, if one\nexists (e.g. "happy-otter-123").',
    },
    devDeploymentName: {
      type: ["string", "null"],
      description:
        "The name of the requesting member's default development deployment for\nthis project, if one exists (an active local deployment or default\ncloud dev deployment).",
    },
  },
};
const schema9 = { type: "string" };
const schema11 = { pattern: "^[0-9]+$", type: "string" };
const schema12 = { type: "string" };
function validate5(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
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
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern0.test(data0)) {
          const err6 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      } else {
        const err7 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err8 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/components/schemas/ProjectName/type",
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
    if (data.teamId !== undefined) {
      let data3 = data.teamId;
      if (typeof data3 === "string") {
        if (!pattern0.test(data3)) {
          const err10 = {
            instancePath: instancePath + "/teamId",
            schemaPath: "#/components/schemas/TeamId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      } else {
        const err11 = {
          instancePath: instancePath + "/teamId",
          schemaPath: "#/components/schemas/TeamId/type",
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
    if (data.teamSlug !== undefined) {
      if (typeof data.teamSlug !== "string") {
        const err12 = {
          instancePath: instancePath + "/teamSlug",
          schemaPath: "#/components/schemas/TeamSlug/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.createTime !== undefined) {
      let data5 = data.createTime;
      if (!(typeof data5 == "number" && !(data5 % 1) && !isNaN(data5))) {
        const err13 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/properties/createTime/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.prodDeploymentName !== undefined) {
      let data6 = data.prodDeploymentName;
      if (typeof data6 !== "string" && data6 !== null) {
        const err14 = {
          instancePath: instancePath + "/prodDeploymentName",
          schemaPath: "#/properties/prodDeploymentName/type",
          keyword: "type",
          params: { type: schema7.properties.prodDeploymentName.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.devDeploymentName !== undefined) {
      let data7 = data.devDeploymentName;
      if (typeof data7 !== "string" && data7 !== null) {
        const err15 = {
          instancePath: instancePath + "/devDeploymentName",
          schemaPath: "#/properties/devDeploymentName/type",
          keyword: "type",
          params: { type: schema7.properties.devDeploymentName.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
  } else {
    const err16 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err16];
    } else {
      vErrors.push(err16);
    }
    errors++;
  }
  validate5.errors = vErrors;
  return errors === 0;
}
validate5.evaluated = {
  props: {
    id: true,
    name: true,
    slug: true,
    teamId: true,
    teamSlug: true,
    createTime: true,
    prodDeploymentName: true,
    devDeploymentName: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
function validate4(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
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
  if (
    !validate5(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate5.errors : vErrors.concat(validate5.errors);
    errors = vErrors.length;
  }
  validate4.errors = vErrors;
  return errors === 0;
}
validate4.evaluated = {
  props: {
    id: true,
    name: true,
    slug: true,
    teamId: true,
    teamSlug: true,
    createTime: true,
    prodDeploymentName: true,
    devDeploymentName: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvListProjectsResponse = validate7;
const schema13 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1projects/get/responses/200/content/application~1json/schema",
};
const schema14 = {
  type: "object",
  required: ["items", "pagination"],
  properties: {
    items: { type: "array", items: { $ref: "#/components/schemas/ProjectResponse" } },
    pagination: { $ref: "#/components/schemas/PaginationMetadata" },
  },
};
const schema21 = {
  type: "object",
  required: ["hasMore"],
  properties: { hasMore: { type: "boolean" }, nextCursor: { type: ["string", "null"] } },
};
function validate9(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate9.evaluated;
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
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern0.test(data0)) {
          const err6 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      } else {
        const err7 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err8 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/components/schemas/ProjectName/type",
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
    if (data.teamId !== undefined) {
      let data3 = data.teamId;
      if (typeof data3 === "string") {
        if (!pattern0.test(data3)) {
          const err10 = {
            instancePath: instancePath + "/teamId",
            schemaPath: "#/components/schemas/TeamId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      } else {
        const err11 = {
          instancePath: instancePath + "/teamId",
          schemaPath: "#/components/schemas/TeamId/type",
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
    if (data.teamSlug !== undefined) {
      if (typeof data.teamSlug !== "string") {
        const err12 = {
          instancePath: instancePath + "/teamSlug",
          schemaPath: "#/components/schemas/TeamSlug/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.createTime !== undefined) {
      let data5 = data.createTime;
      if (!(typeof data5 == "number" && !(data5 % 1) && !isNaN(data5))) {
        const err13 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/properties/createTime/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.prodDeploymentName !== undefined) {
      let data6 = data.prodDeploymentName;
      if (typeof data6 !== "string" && data6 !== null) {
        const err14 = {
          instancePath: instancePath + "/prodDeploymentName",
          schemaPath: "#/properties/prodDeploymentName/type",
          keyword: "type",
          params: { type: schema7.properties.prodDeploymentName.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.devDeploymentName !== undefined) {
      let data7 = data.devDeploymentName;
      if (typeof data7 !== "string" && data7 !== null) {
        const err15 = {
          instancePath: instancePath + "/devDeploymentName",
          schemaPath: "#/properties/devDeploymentName/type",
          keyword: "type",
          params: { type: schema7.properties.devDeploymentName.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
  } else {
    const err16 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err16];
    } else {
      vErrors.push(err16);
    }
    errors++;
  }
  validate9.errors = vErrors;
  return errors === 0;
}
validate9.evaluated = {
  props: {
    id: true,
    name: true,
    slug: true,
    teamId: true,
    teamSlug: true,
    createTime: true,
    prodDeploymentName: true,
    devDeploymentName: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
function validate8(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
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
    if (data.items === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "items" },
        message: "must have required property '" + "items" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.pagination === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "pagination" },
        message: "must have required property '" + "pagination" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.items !== undefined) {
      let data0 = data.items;
      if (Array.isArray(data0)) {
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate9(data0[i0], {
              instancePath: instancePath + "/items/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate9.errors : vErrors.concat(validate9.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err2 = {
          instancePath: instancePath + "/items",
          schemaPath: "#/properties/items/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.pagination !== undefined) {
      let data2 = data.pagination;
      if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
        if (data2.hasMore === undefined) {
          const err3 = {
            instancePath: instancePath + "/pagination",
            schemaPath: "#/components/schemas/PaginationMetadata/required",
            keyword: "required",
            params: { missingProperty: "hasMore" },
            message: "must have required property '" + "hasMore" + "'",
          };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data2.hasMore !== undefined) {
          if (typeof data2.hasMore !== "boolean") {
            const err4 = {
              instancePath: instancePath + "/pagination/hasMore",
              schemaPath: "#/components/schemas/PaginationMetadata/properties/hasMore/type",
              keyword: "type",
              params: { type: "boolean" },
              message: "must be boolean",
            };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data2.nextCursor !== undefined) {
          let data4 = data2.nextCursor;
          if (typeof data4 !== "string" && data4 !== null) {
            const err5 = {
              instancePath: instancePath + "/pagination/nextCursor",
              schemaPath: "#/components/schemas/PaginationMetadata/properties/nextCursor/type",
              keyword: "type",
              params: { type: schema21.properties.nextCursor.type },
              message: "must be string,null",
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
      } else {
        const err6 = {
          instancePath: instancePath + "/pagination",
          schemaPath: "#/components/schemas/PaginationMetadata/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
  } else {
    const err7 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err7];
    } else {
      vErrors.push(err7);
    }
    errors++;
  }
  validate8.errors = vErrors;
  return errors === 0;
}
validate8.evaluated = {
  props: { items: true, pagination: true },
  dynamicProps: false,
  dynamicItems: false,
};
function validate7(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
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
    !validate8(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate8.errors : vErrors.concat(validate8.errors);
    errors = vErrors.length;
  }
  validate7.errors = vErrors;
  return errors === 0;
}
validate7.evaluated = {
  props: { items: true, pagination: true },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvListDeploymentsResponse = validate12;
const schema22 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1projects~1{project_id}~1list_deployments/get/responses/200/content/application~1json/schema",
};
const schema23 = {
  type: "array",
  items: { $ref: "#/components/schemas/PlatformDeploymentResponse" },
};
const schema24 = {
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
        id: { $ref: "#/components/schemas/DeploymentId" },
        name: {
          type: "string",
          description:
            "The readable identifier for this deployment, something like\nplayful-otter-123.",
        },
        createTime: {
          type: "integer",
          format: "int64",
          description: "Timestamp in milliseconds when this deployment was created.",
        },
        lastDeployTime: {
          type: ["integer", "null"],
          format: "int64",
          description: "Timestamp in milliseconds of the last deploy to this deployment, if\nany.",
        },
        deploymentType: {
          $ref: "#/components/schemas/DeploymentType",
          description: "The type of this deployment.",
        },
        projectId: {
          $ref: "#/components/schemas/ProjectId",
          description: "The project this deployment belongs to.",
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
        previewIdentifier: {
          oneOf: [
            { type: "null" },
            {
              $ref: "#/components/schemas/PreviewDeploymentIdentifier",
              description: "Preview deployment identifier, if this is a preview deployment.",
            },
          ],
        },
        region: {
          $ref: "#/components/schemas/RegionName",
          description: "The region where this deployment is hosted.",
        },
        isDefault: {
          $ref: "#/components/schemas/IsDefaultDeployment",
          description:
            "For prod deployments, whether they are the default prod deployment\nof the project. For dev deployments, whether they are the default\ndev deployment for the member that created it.\nFor other deployments, set to false.",
        },
        reference: {
          $ref: "#/components/schemas/DeploymentReference",
          description:
            "An identifier that uniquely identifies this deployment within the\nproject.",
        },
        dashboardEditConfirmation: {
          type: ["boolean", "null"],
          description:
            "Controls whether the dashboard requires a confirmation before\nallowing edits during a browser session for this deployment.\nIf not set, defaults to true for prod deployments and false\nfor dev and preview deployments.",
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
        class: { type: "string", description: "The deployment class for this deployment." },
        sendLogsToClient: {
          type: ["boolean", "null"],
          description:
            "Whether to send function logs to the client. If `null`, the\ndeployment-type default is used (true for dev/preview, false for\nprod).",
        },
        kind: { type: "string", enum: ["cloud"] },
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
        name: { type: "string", description: "The readable identifier for this deployment." },
        createTime: {
          type: "integer",
          format: "int64",
          description: "Timestamp in milliseconds when this deployment was created.",
        },
        deploymentType: {
          $ref: "#/components/schemas/DeploymentType",
          description:
            'Whether this is a "dev" development deployment or "prod" production\ndeployment. Note that this will always be "dev" for local\ndeployments.',
        },
        projectId: {
          $ref: "#/components/schemas/ProjectId",
          description: "The project this deployment belongs to.",
        },
        creator: {
          $ref: "#/components/schemas/MemberId",
          description: "The member who created this deployment.",
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
        port: {
          type: "integer",
          format: "int32",
          description: "The port where this local deployment is running.",
          minimum: 0,
        },
        deviceName: {
          $ref: "#/components/schemas/DeviceName",
          description: "The device name where this local deployment is running.",
        },
        isActive: {
          type: "boolean",
          description: "Whether this local deployment is currently active.",
        },
        kind: { type: "string", enum: ["local"] },
      },
    },
  ],
};
const schema25 = { pattern: "^[0-9]+$", type: "string" };
const schema26 = { type: "string", enum: ["dev", "prod", "preview", "custom"] };
const schema28 = { pattern: "^[0-9]+$", type: "string" };
const schema29 = { type: "string" };
const schema30 = {
  type: "string",
  enum: ["aws-us-east-1", "aws-eu-west-1", "aws-ca-central-1", "aws-ap-southeast-2"],
};
const schema31 = {
  type: "boolean",
  description:
    "Indicates whether the deployment is the default prod deployment for the\nproject, or the default cloud dev deployment for the member in the project.",
};
const schema32 = {
  type: "string",
  description: "An identifier that uniquely identifies this deployment within the project.",
};
const schema37 = { type: "string" };
function validate14(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
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
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern0.test(data0)) {
          const err11 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/DeploymentId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      } else {
        const err12 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/DeploymentId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err13 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/oneOf/0/properties/name/type",
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
    if (data.createTime !== undefined) {
      let data2 = data.createTime;
      if (!(typeof data2 == "number" && !(data2 % 1) && !isNaN(data2))) {
        const err14 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/oneOf/0/properties/createTime/type",
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
    }
    if (data.lastDeployTime !== undefined) {
      let data3 = data.lastDeployTime;
      if (!(typeof data3 == "number" && !(data3 % 1) && !isNaN(data3)) && data3 !== null) {
        const err15 = {
          instancePath: instancePath + "/lastDeployTime",
          schemaPath: "#/oneOf/0/properties/lastDeployTime/type",
          keyword: "type",
          params: { type: schema24.oneOf[0].properties.lastDeployTime.type },
          message: "must be integer,null",
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.deploymentType !== undefined) {
      let data4 = data.deploymentType;
      if (typeof data4 !== "string") {
        const err16 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/type",
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
      if (!(data4 === "dev" || data4 === "prod" || data4 === "preview" || data4 === "custom")) {
        const err17 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/enum",
          keyword: "enum",
          params: { allowedValues: schema26.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    if (data.projectId !== undefined) {
      let data5 = data.projectId;
      if (typeof data5 === "string") {
        if (!pattern0.test(data5)) {
          const err18 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
      } else {
        const err19 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
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
    }
    if (data.creator !== undefined) {
      let data6 = data.creator;
      const _errs19 = errors;
      let valid5 = false;
      let passing1 = null;
      const _errs20 = errors;
      if (data6 !== null) {
        const err20 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/oneOf/0/properties/creator/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
      var _valid1 = _errs20 === errors;
      if (_valid1) {
        valid5 = true;
        passing1 = 0;
      }
      const _errs22 = errors;
      if (typeof data6 === "string") {
        if (!pattern0.test(data6)) {
          const err21 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      } else {
        const err22 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
      var _valid1 = _errs22 === errors;
      if (_valid1 && valid5) {
        valid5 = false;
        passing1 = [passing1, 1];
      } else {
        if (_valid1) {
          valid5 = true;
          passing1 = 1;
        }
      }
      if (!valid5) {
        const err23 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/oneOf/0/properties/creator/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing1 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      } else {
        errors = _errs19;
        if (vErrors !== null) {
          if (_errs19) {
            vErrors.length = _errs19;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.previewIdentifier !== undefined) {
      let data7 = data.previewIdentifier;
      const _errs26 = errors;
      let valid7 = false;
      let passing2 = null;
      const _errs27 = errors;
      if (data7 !== null) {
        const err24 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/0/properties/previewIdentifier/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
      var _valid2 = _errs27 === errors;
      if (_valid2) {
        valid7 = true;
        passing2 = 0;
      }
      const _errs29 = errors;
      if (typeof data7 !== "string") {
        const err25 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/components/schemas/PreviewDeploymentIdentifier/type",
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
      var _valid2 = _errs29 === errors;
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
        const err26 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/0/properties/previewIdentifier/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing2 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
        }
        errors++;
      } else {
        errors = _errs26;
        if (vErrors !== null) {
          if (_errs26) {
            vErrors.length = _errs26;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.region !== undefined) {
      let data8 = data.region;
      if (typeof data8 !== "string") {
        const err27 = {
          instancePath: instancePath + "/region",
          schemaPath: "#/components/schemas/RegionName/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
      if (
        !(
          data8 === "aws-us-east-1" ||
          data8 === "aws-eu-west-1" ||
          data8 === "aws-ca-central-1" ||
          data8 === "aws-ap-southeast-2"
        )
      ) {
        const err28 = {
          instancePath: instancePath + "/region",
          schemaPath: "#/components/schemas/RegionName/enum",
          keyword: "enum",
          params: { allowedValues: schema30.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err28];
        } else {
          vErrors.push(err28);
        }
        errors++;
      }
    }
    if (data.isDefault !== undefined) {
      if (typeof data.isDefault !== "boolean") {
        const err29 = {
          instancePath: instancePath + "/isDefault",
          schemaPath: "#/components/schemas/IsDefaultDeployment/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
        };
        if (vErrors === null) {
          vErrors = [err29];
        } else {
          vErrors.push(err29);
        }
        errors++;
      }
    }
    if (data.reference !== undefined) {
      if (typeof data.reference !== "string") {
        const err30 = {
          instancePath: instancePath + "/reference",
          schemaPath: "#/components/schemas/DeploymentReference/type",
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
    }
    if (data.dashboardEditConfirmation !== undefined) {
      let data11 = data.dashboardEditConfirmation;
      if (typeof data11 !== "boolean" && data11 !== null) {
        const err31 = {
          instancePath: instancePath + "/dashboardEditConfirmation",
          schemaPath: "#/oneOf/0/properties/dashboardEditConfirmation/type",
          keyword: "type",
          params: { type: schema24.oneOf[0].properties.dashboardEditConfirmation.type },
          message: "must be boolean,null",
        };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      }
    }
    if (data.deploymentUrl !== undefined) {
      if (typeof data.deploymentUrl !== "string") {
        const err32 = {
          instancePath: instancePath + "/deploymentUrl",
          schemaPath: "#/oneOf/0/properties/deploymentUrl/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err32];
        } else {
          vErrors.push(err32);
        }
        errors++;
      }
    }
    if (data.expiresAt !== undefined) {
      let data13 = data.expiresAt;
      if (!(typeof data13 == "number" && !(data13 % 1) && !isNaN(data13)) && data13 !== null) {
        const err33 = {
          instancePath: instancePath + "/expiresAt",
          schemaPath: "#/oneOf/0/properties/expiresAt/type",
          keyword: "type",
          params: { type: schema24.oneOf[0].properties.expiresAt.type },
          message: "must be integer,null",
        };
        if (vErrors === null) {
          vErrors = [err33];
        } else {
          vErrors.push(err33);
        }
        errors++;
      }
    }
    if (data.class !== undefined) {
      if (typeof data.class !== "string") {
        const err34 = {
          instancePath: instancePath + "/class",
          schemaPath: "#/oneOf/0/properties/class/type",
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
    if (data.sendLogsToClient !== undefined) {
      let data15 = data.sendLogsToClient;
      if (typeof data15 !== "boolean" && data15 !== null) {
        const err35 = {
          instancePath: instancePath + "/sendLogsToClient",
          schemaPath: "#/oneOf/0/properties/sendLogsToClient/type",
          keyword: "type",
          params: { type: schema24.oneOf[0].properties.sendLogsToClient.type },
          message: "must be boolean,null",
        };
        if (vErrors === null) {
          vErrors = [err35];
        } else {
          vErrors.push(err35);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      let data16 = data.kind;
      if (typeof data16 !== "string") {
        const err36 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/0/properties/kind/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err36];
        } else {
          vErrors.push(err36);
        }
        errors++;
      }
      if (!(data16 === "cloud")) {
        const err37 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/0/properties/kind/enum",
          keyword: "enum",
          params: { allowedValues: schema24.oneOf[0].properties.kind.enum },
          message: "must be equal to one of the allowed values",
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
    props0.id = true;
    props0.name = true;
    props0.createTime = true;
    props0.lastDeployTime = true;
    props0.deploymentType = true;
    props0.projectId = true;
    props0.creator = true;
    props0.previewIdentifier = true;
    props0.region = true;
    props0.isDefault = true;
    props0.reference = true;
    props0.dashboardEditConfirmation = true;
    props0.deploymentUrl = true;
    props0.expiresAt = true;
    props0.class = true;
    props0.sendLogsToClient = true;
    props0.kind = true;
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
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err48 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/oneOf/1/properties/name/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err48];
        } else {
          vErrors.push(err48);
        }
        errors++;
      }
    }
    if (data.createTime !== undefined) {
      let data18 = data.createTime;
      if (!(typeof data18 == "number" && !(data18 % 1) && !isNaN(data18))) {
        const err49 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/oneOf/1/properties/createTime/type",
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
    }
    if (data.deploymentType !== undefined) {
      let data19 = data.deploymentType;
      if (typeof data19 !== "string") {
        const err50 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err50];
        } else {
          vErrors.push(err50);
        }
        errors++;
      }
      if (!(data19 === "dev" || data19 === "prod" || data19 === "preview" || data19 === "custom")) {
        const err51 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/enum",
          keyword: "enum",
          params: { allowedValues: schema26.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err51];
        } else {
          vErrors.push(err51);
        }
        errors++;
      }
    }
    if (data.projectId !== undefined) {
      let data20 = data.projectId;
      if (typeof data20 === "string") {
        if (!pattern0.test(data20)) {
          const err52 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err52];
          } else {
            vErrors.push(err52);
          }
          errors++;
        }
      } else {
        const err53 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
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
    if (data.creator !== undefined) {
      let data21 = data.creator;
      if (typeof data21 === "string") {
        if (!pattern0.test(data21)) {
          const err54 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err54];
          } else {
            vErrors.push(err54);
          }
          errors++;
        }
      } else {
        const err55 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
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
    }
    if (data.previewIdentifier !== undefined) {
      let data22 = data.previewIdentifier;
      const _errs69 = errors;
      let valid16 = false;
      let passing3 = null;
      const _errs70 = errors;
      if (data22 !== null) {
        const err56 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/1/properties/previewIdentifier/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err56];
        } else {
          vErrors.push(err56);
        }
        errors++;
      }
      var _valid3 = _errs70 === errors;
      if (_valid3) {
        valid16 = true;
        passing3 = 0;
      }
      const _errs72 = errors;
      if (typeof data22 !== "string") {
        const err57 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/components/schemas/PreviewDeploymentIdentifier/type",
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
      var _valid3 = _errs72 === errors;
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
        const err58 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/1/properties/previewIdentifier/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing3 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err58];
        } else {
          vErrors.push(err58);
        }
        errors++;
      } else {
        errors = _errs69;
        if (vErrors !== null) {
          if (_errs69) {
            vErrors.length = _errs69;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.port !== undefined) {
      let data23 = data.port;
      if (!(typeof data23 == "number" && !(data23 % 1) && !isNaN(data23))) {
        const err59 = {
          instancePath: instancePath + "/port",
          schemaPath: "#/oneOf/1/properties/port/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err59];
        } else {
          vErrors.push(err59);
        }
        errors++;
      }
      if (typeof data23 == "number") {
        if (data23 < 0 || isNaN(data23)) {
          const err60 = {
            instancePath: instancePath + "/port",
            schemaPath: "#/oneOf/1/properties/port/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err60];
          } else {
            vErrors.push(err60);
          }
          errors++;
        }
      }
    }
    if (data.deviceName !== undefined) {
      if (typeof data.deviceName !== "string") {
        const err61 = {
          instancePath: instancePath + "/deviceName",
          schemaPath: "#/components/schemas/DeviceName/type",
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
    }
    if (data.isActive !== undefined) {
      if (typeof data.isActive !== "boolean") {
        const err62 = {
          instancePath: instancePath + "/isActive",
          schemaPath: "#/oneOf/1/properties/isActive/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
        };
        if (vErrors === null) {
          vErrors = [err62];
        } else {
          vErrors.push(err62);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      let data26 = data.kind;
      if (typeof data26 !== "string") {
        const err63 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/1/properties/kind/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err63];
        } else {
          vErrors.push(err63);
        }
        errors++;
      }
      if (!(data26 === "local")) {
        const err64 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/1/properties/kind/enum",
          keyword: "enum",
          params: { allowedValues: schema24.oneOf[1].properties.kind.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err64];
        } else {
          vErrors.push(err64);
        }
        errors++;
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
        props0.name = true;
        props0.createTime = true;
        props0.deploymentType = true;
        props0.projectId = true;
        props0.creator = true;
        props0.previewIdentifier = true;
        props0.port = true;
        props0.deviceName = true;
        props0.isActive = true;
        props0.kind = true;
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
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
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
        vErrors = vErrors === null ? validate14.errors : vErrors.concat(validate14.errors);
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
validate13.evaluated = { items: true, dynamicProps: false, dynamicItems: false };
function validate12(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate12.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate13(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate13.errors : vErrors.concat(validate13.errors);
    errors = vErrors.length;
  }
  validate12.errors = vErrors;
  return errors === 0;
}
validate12.evaluated = { items: true, dynamicProps: false, dynamicItems: false };
export const ajvGetDeploymentInProjectByProjectIdResponse = validate17;
const schema38 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1projects~1{project_id}~1deployment/get/responses/200/content/application~1json/schema",
};
function validate18(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate18.evaluated;
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
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern0.test(data0)) {
          const err11 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/DeploymentId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      } else {
        const err12 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/DeploymentId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err13 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/oneOf/0/properties/name/type",
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
    if (data.createTime !== undefined) {
      let data2 = data.createTime;
      if (!(typeof data2 == "number" && !(data2 % 1) && !isNaN(data2))) {
        const err14 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/oneOf/0/properties/createTime/type",
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
    }
    if (data.lastDeployTime !== undefined) {
      let data3 = data.lastDeployTime;
      if (!(typeof data3 == "number" && !(data3 % 1) && !isNaN(data3)) && data3 !== null) {
        const err15 = {
          instancePath: instancePath + "/lastDeployTime",
          schemaPath: "#/oneOf/0/properties/lastDeployTime/type",
          keyword: "type",
          params: { type: schema24.oneOf[0].properties.lastDeployTime.type },
          message: "must be integer,null",
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.deploymentType !== undefined) {
      let data4 = data.deploymentType;
      if (typeof data4 !== "string") {
        const err16 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/type",
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
      if (!(data4 === "dev" || data4 === "prod" || data4 === "preview" || data4 === "custom")) {
        const err17 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/enum",
          keyword: "enum",
          params: { allowedValues: schema26.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    if (data.projectId !== undefined) {
      let data5 = data.projectId;
      if (typeof data5 === "string") {
        if (!pattern0.test(data5)) {
          const err18 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
      } else {
        const err19 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
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
    }
    if (data.creator !== undefined) {
      let data6 = data.creator;
      const _errs19 = errors;
      let valid5 = false;
      let passing1 = null;
      const _errs20 = errors;
      if (data6 !== null) {
        const err20 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/oneOf/0/properties/creator/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
      var _valid1 = _errs20 === errors;
      if (_valid1) {
        valid5 = true;
        passing1 = 0;
      }
      const _errs22 = errors;
      if (typeof data6 === "string") {
        if (!pattern0.test(data6)) {
          const err21 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      } else {
        const err22 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
      var _valid1 = _errs22 === errors;
      if (_valid1 && valid5) {
        valid5 = false;
        passing1 = [passing1, 1];
      } else {
        if (_valid1) {
          valid5 = true;
          passing1 = 1;
        }
      }
      if (!valid5) {
        const err23 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/oneOf/0/properties/creator/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing1 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      } else {
        errors = _errs19;
        if (vErrors !== null) {
          if (_errs19) {
            vErrors.length = _errs19;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.previewIdentifier !== undefined) {
      let data7 = data.previewIdentifier;
      const _errs26 = errors;
      let valid7 = false;
      let passing2 = null;
      const _errs27 = errors;
      if (data7 !== null) {
        const err24 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/0/properties/previewIdentifier/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
      var _valid2 = _errs27 === errors;
      if (_valid2) {
        valid7 = true;
        passing2 = 0;
      }
      const _errs29 = errors;
      if (typeof data7 !== "string") {
        const err25 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/components/schemas/PreviewDeploymentIdentifier/type",
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
      var _valid2 = _errs29 === errors;
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
        const err26 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/0/properties/previewIdentifier/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing2 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
        }
        errors++;
      } else {
        errors = _errs26;
        if (vErrors !== null) {
          if (_errs26) {
            vErrors.length = _errs26;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.region !== undefined) {
      let data8 = data.region;
      if (typeof data8 !== "string") {
        const err27 = {
          instancePath: instancePath + "/region",
          schemaPath: "#/components/schemas/RegionName/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
      if (
        !(
          data8 === "aws-us-east-1" ||
          data8 === "aws-eu-west-1" ||
          data8 === "aws-ca-central-1" ||
          data8 === "aws-ap-southeast-2"
        )
      ) {
        const err28 = {
          instancePath: instancePath + "/region",
          schemaPath: "#/components/schemas/RegionName/enum",
          keyword: "enum",
          params: { allowedValues: schema30.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err28];
        } else {
          vErrors.push(err28);
        }
        errors++;
      }
    }
    if (data.isDefault !== undefined) {
      if (typeof data.isDefault !== "boolean") {
        const err29 = {
          instancePath: instancePath + "/isDefault",
          schemaPath: "#/components/schemas/IsDefaultDeployment/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
        };
        if (vErrors === null) {
          vErrors = [err29];
        } else {
          vErrors.push(err29);
        }
        errors++;
      }
    }
    if (data.reference !== undefined) {
      if (typeof data.reference !== "string") {
        const err30 = {
          instancePath: instancePath + "/reference",
          schemaPath: "#/components/schemas/DeploymentReference/type",
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
    }
    if (data.dashboardEditConfirmation !== undefined) {
      let data11 = data.dashboardEditConfirmation;
      if (typeof data11 !== "boolean" && data11 !== null) {
        const err31 = {
          instancePath: instancePath + "/dashboardEditConfirmation",
          schemaPath: "#/oneOf/0/properties/dashboardEditConfirmation/type",
          keyword: "type",
          params: { type: schema24.oneOf[0].properties.dashboardEditConfirmation.type },
          message: "must be boolean,null",
        };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      }
    }
    if (data.deploymentUrl !== undefined) {
      if (typeof data.deploymentUrl !== "string") {
        const err32 = {
          instancePath: instancePath + "/deploymentUrl",
          schemaPath: "#/oneOf/0/properties/deploymentUrl/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err32];
        } else {
          vErrors.push(err32);
        }
        errors++;
      }
    }
    if (data.expiresAt !== undefined) {
      let data13 = data.expiresAt;
      if (!(typeof data13 == "number" && !(data13 % 1) && !isNaN(data13)) && data13 !== null) {
        const err33 = {
          instancePath: instancePath + "/expiresAt",
          schemaPath: "#/oneOf/0/properties/expiresAt/type",
          keyword: "type",
          params: { type: schema24.oneOf[0].properties.expiresAt.type },
          message: "must be integer,null",
        };
        if (vErrors === null) {
          vErrors = [err33];
        } else {
          vErrors.push(err33);
        }
        errors++;
      }
    }
    if (data.class !== undefined) {
      if (typeof data.class !== "string") {
        const err34 = {
          instancePath: instancePath + "/class",
          schemaPath: "#/oneOf/0/properties/class/type",
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
    if (data.sendLogsToClient !== undefined) {
      let data15 = data.sendLogsToClient;
      if (typeof data15 !== "boolean" && data15 !== null) {
        const err35 = {
          instancePath: instancePath + "/sendLogsToClient",
          schemaPath: "#/oneOf/0/properties/sendLogsToClient/type",
          keyword: "type",
          params: { type: schema24.oneOf[0].properties.sendLogsToClient.type },
          message: "must be boolean,null",
        };
        if (vErrors === null) {
          vErrors = [err35];
        } else {
          vErrors.push(err35);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      let data16 = data.kind;
      if (typeof data16 !== "string") {
        const err36 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/0/properties/kind/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err36];
        } else {
          vErrors.push(err36);
        }
        errors++;
      }
      if (!(data16 === "cloud")) {
        const err37 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/0/properties/kind/enum",
          keyword: "enum",
          params: { allowedValues: schema24.oneOf[0].properties.kind.enum },
          message: "must be equal to one of the allowed values",
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
    props0.id = true;
    props0.name = true;
    props0.createTime = true;
    props0.lastDeployTime = true;
    props0.deploymentType = true;
    props0.projectId = true;
    props0.creator = true;
    props0.previewIdentifier = true;
    props0.region = true;
    props0.isDefault = true;
    props0.reference = true;
    props0.dashboardEditConfirmation = true;
    props0.deploymentUrl = true;
    props0.expiresAt = true;
    props0.class = true;
    props0.sendLogsToClient = true;
    props0.kind = true;
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
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err48 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/oneOf/1/properties/name/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err48];
        } else {
          vErrors.push(err48);
        }
        errors++;
      }
    }
    if (data.createTime !== undefined) {
      let data18 = data.createTime;
      if (!(typeof data18 == "number" && !(data18 % 1) && !isNaN(data18))) {
        const err49 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/oneOf/1/properties/createTime/type",
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
    }
    if (data.deploymentType !== undefined) {
      let data19 = data.deploymentType;
      if (typeof data19 !== "string") {
        const err50 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err50];
        } else {
          vErrors.push(err50);
        }
        errors++;
      }
      if (!(data19 === "dev" || data19 === "prod" || data19 === "preview" || data19 === "custom")) {
        const err51 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/enum",
          keyword: "enum",
          params: { allowedValues: schema26.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err51];
        } else {
          vErrors.push(err51);
        }
        errors++;
      }
    }
    if (data.projectId !== undefined) {
      let data20 = data.projectId;
      if (typeof data20 === "string") {
        if (!pattern0.test(data20)) {
          const err52 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err52];
          } else {
            vErrors.push(err52);
          }
          errors++;
        }
      } else {
        const err53 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
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
    if (data.creator !== undefined) {
      let data21 = data.creator;
      if (typeof data21 === "string") {
        if (!pattern0.test(data21)) {
          const err54 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err54];
          } else {
            vErrors.push(err54);
          }
          errors++;
        }
      } else {
        const err55 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
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
    }
    if (data.previewIdentifier !== undefined) {
      let data22 = data.previewIdentifier;
      const _errs69 = errors;
      let valid16 = false;
      let passing3 = null;
      const _errs70 = errors;
      if (data22 !== null) {
        const err56 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/1/properties/previewIdentifier/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err56];
        } else {
          vErrors.push(err56);
        }
        errors++;
      }
      var _valid3 = _errs70 === errors;
      if (_valid3) {
        valid16 = true;
        passing3 = 0;
      }
      const _errs72 = errors;
      if (typeof data22 !== "string") {
        const err57 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/components/schemas/PreviewDeploymentIdentifier/type",
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
      var _valid3 = _errs72 === errors;
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
        const err58 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/1/properties/previewIdentifier/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing3 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err58];
        } else {
          vErrors.push(err58);
        }
        errors++;
      } else {
        errors = _errs69;
        if (vErrors !== null) {
          if (_errs69) {
            vErrors.length = _errs69;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.port !== undefined) {
      let data23 = data.port;
      if (!(typeof data23 == "number" && !(data23 % 1) && !isNaN(data23))) {
        const err59 = {
          instancePath: instancePath + "/port",
          schemaPath: "#/oneOf/1/properties/port/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err59];
        } else {
          vErrors.push(err59);
        }
        errors++;
      }
      if (typeof data23 == "number") {
        if (data23 < 0 || isNaN(data23)) {
          const err60 = {
            instancePath: instancePath + "/port",
            schemaPath: "#/oneOf/1/properties/port/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err60];
          } else {
            vErrors.push(err60);
          }
          errors++;
        }
      }
    }
    if (data.deviceName !== undefined) {
      if (typeof data.deviceName !== "string") {
        const err61 = {
          instancePath: instancePath + "/deviceName",
          schemaPath: "#/components/schemas/DeviceName/type",
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
    }
    if (data.isActive !== undefined) {
      if (typeof data.isActive !== "boolean") {
        const err62 = {
          instancePath: instancePath + "/isActive",
          schemaPath: "#/oneOf/1/properties/isActive/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
        };
        if (vErrors === null) {
          vErrors = [err62];
        } else {
          vErrors.push(err62);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      let data26 = data.kind;
      if (typeof data26 !== "string") {
        const err63 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/1/properties/kind/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err63];
        } else {
          vErrors.push(err63);
        }
        errors++;
      }
      if (!(data26 === "local")) {
        const err64 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/1/properties/kind/enum",
          keyword: "enum",
          params: { allowedValues: schema24.oneOf[1].properties.kind.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err64];
        } else {
          vErrors.push(err64);
        }
        errors++;
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
        props0.name = true;
        props0.createTime = true;
        props0.deploymentType = true;
        props0.projectId = true;
        props0.creator = true;
        props0.previewIdentifier = true;
        props0.port = true;
        props0.deviceName = true;
        props0.isActive = true;
        props0.kind = true;
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
  validate18.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate18.evaluated = { dynamicProps: true, dynamicItems: false };
function validate17(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
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
  if (
    !validate18(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate18.errors : vErrors.concat(validate18.errors);
    errors = vErrors.length;
  } else {
    var props0 = validate18.evaluated.props;
  }
  validate17.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate17.evaluated = { dynamicProps: true, dynamicItems: false };
export const ajvGetDeploymentInProjectByProjectSlugResponse = validate20;
const schema53 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id_or_slug}~1projects~1{project_slug}~1deployment/get/responses/200/content/application~1json/schema",
};
function validate21(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate21.evaluated;
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
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern0.test(data0)) {
          const err11 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/DeploymentId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      } else {
        const err12 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/DeploymentId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err13 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/oneOf/0/properties/name/type",
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
    if (data.createTime !== undefined) {
      let data2 = data.createTime;
      if (!(typeof data2 == "number" && !(data2 % 1) && !isNaN(data2))) {
        const err14 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/oneOf/0/properties/createTime/type",
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
    }
    if (data.lastDeployTime !== undefined) {
      let data3 = data.lastDeployTime;
      if (!(typeof data3 == "number" && !(data3 % 1) && !isNaN(data3)) && data3 !== null) {
        const err15 = {
          instancePath: instancePath + "/lastDeployTime",
          schemaPath: "#/oneOf/0/properties/lastDeployTime/type",
          keyword: "type",
          params: { type: schema24.oneOf[0].properties.lastDeployTime.type },
          message: "must be integer,null",
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.deploymentType !== undefined) {
      let data4 = data.deploymentType;
      if (typeof data4 !== "string") {
        const err16 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/type",
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
      if (!(data4 === "dev" || data4 === "prod" || data4 === "preview" || data4 === "custom")) {
        const err17 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/enum",
          keyword: "enum",
          params: { allowedValues: schema26.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    if (data.projectId !== undefined) {
      let data5 = data.projectId;
      if (typeof data5 === "string") {
        if (!pattern0.test(data5)) {
          const err18 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
      } else {
        const err19 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
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
    }
    if (data.creator !== undefined) {
      let data6 = data.creator;
      const _errs19 = errors;
      let valid5 = false;
      let passing1 = null;
      const _errs20 = errors;
      if (data6 !== null) {
        const err20 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/oneOf/0/properties/creator/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
      var _valid1 = _errs20 === errors;
      if (_valid1) {
        valid5 = true;
        passing1 = 0;
      }
      const _errs22 = errors;
      if (typeof data6 === "string") {
        if (!pattern0.test(data6)) {
          const err21 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      } else {
        const err22 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
      var _valid1 = _errs22 === errors;
      if (_valid1 && valid5) {
        valid5 = false;
        passing1 = [passing1, 1];
      } else {
        if (_valid1) {
          valid5 = true;
          passing1 = 1;
        }
      }
      if (!valid5) {
        const err23 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/oneOf/0/properties/creator/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing1 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      } else {
        errors = _errs19;
        if (vErrors !== null) {
          if (_errs19) {
            vErrors.length = _errs19;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.previewIdentifier !== undefined) {
      let data7 = data.previewIdentifier;
      const _errs26 = errors;
      let valid7 = false;
      let passing2 = null;
      const _errs27 = errors;
      if (data7 !== null) {
        const err24 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/0/properties/previewIdentifier/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
      var _valid2 = _errs27 === errors;
      if (_valid2) {
        valid7 = true;
        passing2 = 0;
      }
      const _errs29 = errors;
      if (typeof data7 !== "string") {
        const err25 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/components/schemas/PreviewDeploymentIdentifier/type",
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
      var _valid2 = _errs29 === errors;
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
        const err26 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/0/properties/previewIdentifier/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing2 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
        }
        errors++;
      } else {
        errors = _errs26;
        if (vErrors !== null) {
          if (_errs26) {
            vErrors.length = _errs26;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.region !== undefined) {
      let data8 = data.region;
      if (typeof data8 !== "string") {
        const err27 = {
          instancePath: instancePath + "/region",
          schemaPath: "#/components/schemas/RegionName/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
      if (
        !(
          data8 === "aws-us-east-1" ||
          data8 === "aws-eu-west-1" ||
          data8 === "aws-ca-central-1" ||
          data8 === "aws-ap-southeast-2"
        )
      ) {
        const err28 = {
          instancePath: instancePath + "/region",
          schemaPath: "#/components/schemas/RegionName/enum",
          keyword: "enum",
          params: { allowedValues: schema30.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err28];
        } else {
          vErrors.push(err28);
        }
        errors++;
      }
    }
    if (data.isDefault !== undefined) {
      if (typeof data.isDefault !== "boolean") {
        const err29 = {
          instancePath: instancePath + "/isDefault",
          schemaPath: "#/components/schemas/IsDefaultDeployment/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
        };
        if (vErrors === null) {
          vErrors = [err29];
        } else {
          vErrors.push(err29);
        }
        errors++;
      }
    }
    if (data.reference !== undefined) {
      if (typeof data.reference !== "string") {
        const err30 = {
          instancePath: instancePath + "/reference",
          schemaPath: "#/components/schemas/DeploymentReference/type",
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
    }
    if (data.dashboardEditConfirmation !== undefined) {
      let data11 = data.dashboardEditConfirmation;
      if (typeof data11 !== "boolean" && data11 !== null) {
        const err31 = {
          instancePath: instancePath + "/dashboardEditConfirmation",
          schemaPath: "#/oneOf/0/properties/dashboardEditConfirmation/type",
          keyword: "type",
          params: { type: schema24.oneOf[0].properties.dashboardEditConfirmation.type },
          message: "must be boolean,null",
        };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      }
    }
    if (data.deploymentUrl !== undefined) {
      if (typeof data.deploymentUrl !== "string") {
        const err32 = {
          instancePath: instancePath + "/deploymentUrl",
          schemaPath: "#/oneOf/0/properties/deploymentUrl/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err32];
        } else {
          vErrors.push(err32);
        }
        errors++;
      }
    }
    if (data.expiresAt !== undefined) {
      let data13 = data.expiresAt;
      if (!(typeof data13 == "number" && !(data13 % 1) && !isNaN(data13)) && data13 !== null) {
        const err33 = {
          instancePath: instancePath + "/expiresAt",
          schemaPath: "#/oneOf/0/properties/expiresAt/type",
          keyword: "type",
          params: { type: schema24.oneOf[0].properties.expiresAt.type },
          message: "must be integer,null",
        };
        if (vErrors === null) {
          vErrors = [err33];
        } else {
          vErrors.push(err33);
        }
        errors++;
      }
    }
    if (data.class !== undefined) {
      if (typeof data.class !== "string") {
        const err34 = {
          instancePath: instancePath + "/class",
          schemaPath: "#/oneOf/0/properties/class/type",
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
    if (data.sendLogsToClient !== undefined) {
      let data15 = data.sendLogsToClient;
      if (typeof data15 !== "boolean" && data15 !== null) {
        const err35 = {
          instancePath: instancePath + "/sendLogsToClient",
          schemaPath: "#/oneOf/0/properties/sendLogsToClient/type",
          keyword: "type",
          params: { type: schema24.oneOf[0].properties.sendLogsToClient.type },
          message: "must be boolean,null",
        };
        if (vErrors === null) {
          vErrors = [err35];
        } else {
          vErrors.push(err35);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      let data16 = data.kind;
      if (typeof data16 !== "string") {
        const err36 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/0/properties/kind/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err36];
        } else {
          vErrors.push(err36);
        }
        errors++;
      }
      if (!(data16 === "cloud")) {
        const err37 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/0/properties/kind/enum",
          keyword: "enum",
          params: { allowedValues: schema24.oneOf[0].properties.kind.enum },
          message: "must be equal to one of the allowed values",
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
    props0.id = true;
    props0.name = true;
    props0.createTime = true;
    props0.lastDeployTime = true;
    props0.deploymentType = true;
    props0.projectId = true;
    props0.creator = true;
    props0.previewIdentifier = true;
    props0.region = true;
    props0.isDefault = true;
    props0.reference = true;
    props0.dashboardEditConfirmation = true;
    props0.deploymentUrl = true;
    props0.expiresAt = true;
    props0.class = true;
    props0.sendLogsToClient = true;
    props0.kind = true;
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
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err48 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/oneOf/1/properties/name/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err48];
        } else {
          vErrors.push(err48);
        }
        errors++;
      }
    }
    if (data.createTime !== undefined) {
      let data18 = data.createTime;
      if (!(typeof data18 == "number" && !(data18 % 1) && !isNaN(data18))) {
        const err49 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/oneOf/1/properties/createTime/type",
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
    }
    if (data.deploymentType !== undefined) {
      let data19 = data.deploymentType;
      if (typeof data19 !== "string") {
        const err50 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err50];
        } else {
          vErrors.push(err50);
        }
        errors++;
      }
      if (!(data19 === "dev" || data19 === "prod" || data19 === "preview" || data19 === "custom")) {
        const err51 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/enum",
          keyword: "enum",
          params: { allowedValues: schema26.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err51];
        } else {
          vErrors.push(err51);
        }
        errors++;
      }
    }
    if (data.projectId !== undefined) {
      let data20 = data.projectId;
      if (typeof data20 === "string") {
        if (!pattern0.test(data20)) {
          const err52 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err52];
          } else {
            vErrors.push(err52);
          }
          errors++;
        }
      } else {
        const err53 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
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
    if (data.creator !== undefined) {
      let data21 = data.creator;
      if (typeof data21 === "string") {
        if (!pattern0.test(data21)) {
          const err54 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err54];
          } else {
            vErrors.push(err54);
          }
          errors++;
        }
      } else {
        const err55 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
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
    }
    if (data.previewIdentifier !== undefined) {
      let data22 = data.previewIdentifier;
      const _errs69 = errors;
      let valid16 = false;
      let passing3 = null;
      const _errs70 = errors;
      if (data22 !== null) {
        const err56 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/1/properties/previewIdentifier/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err56];
        } else {
          vErrors.push(err56);
        }
        errors++;
      }
      var _valid3 = _errs70 === errors;
      if (_valid3) {
        valid16 = true;
        passing3 = 0;
      }
      const _errs72 = errors;
      if (typeof data22 !== "string") {
        const err57 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/components/schemas/PreviewDeploymentIdentifier/type",
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
      var _valid3 = _errs72 === errors;
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
        const err58 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/1/properties/previewIdentifier/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing3 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err58];
        } else {
          vErrors.push(err58);
        }
        errors++;
      } else {
        errors = _errs69;
        if (vErrors !== null) {
          if (_errs69) {
            vErrors.length = _errs69;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.port !== undefined) {
      let data23 = data.port;
      if (!(typeof data23 == "number" && !(data23 % 1) && !isNaN(data23))) {
        const err59 = {
          instancePath: instancePath + "/port",
          schemaPath: "#/oneOf/1/properties/port/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err59];
        } else {
          vErrors.push(err59);
        }
        errors++;
      }
      if (typeof data23 == "number") {
        if (data23 < 0 || isNaN(data23)) {
          const err60 = {
            instancePath: instancePath + "/port",
            schemaPath: "#/oneOf/1/properties/port/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err60];
          } else {
            vErrors.push(err60);
          }
          errors++;
        }
      }
    }
    if (data.deviceName !== undefined) {
      if (typeof data.deviceName !== "string") {
        const err61 = {
          instancePath: instancePath + "/deviceName",
          schemaPath: "#/components/schemas/DeviceName/type",
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
    }
    if (data.isActive !== undefined) {
      if (typeof data.isActive !== "boolean") {
        const err62 = {
          instancePath: instancePath + "/isActive",
          schemaPath: "#/oneOf/1/properties/isActive/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
        };
        if (vErrors === null) {
          vErrors = [err62];
        } else {
          vErrors.push(err62);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      let data26 = data.kind;
      if (typeof data26 !== "string") {
        const err63 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/1/properties/kind/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err63];
        } else {
          vErrors.push(err63);
        }
        errors++;
      }
      if (!(data26 === "local")) {
        const err64 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/1/properties/kind/enum",
          keyword: "enum",
          params: { allowedValues: schema24.oneOf[1].properties.kind.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err64];
        } else {
          vErrors.push(err64);
        }
        errors++;
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
        props0.name = true;
        props0.createTime = true;
        props0.deploymentType = true;
        props0.projectId = true;
        props0.creator = true;
        props0.previewIdentifier = true;
        props0.port = true;
        props0.deviceName = true;
        props0.isActive = true;
        props0.kind = true;
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
  validate21.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate21.evaluated = { dynamicProps: true, dynamicItems: false };
function validate20(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate20.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate21(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
    errors = vErrors.length;
  } else {
    var props0 = validate21.evaluated.props;
  }
  validate20.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate20.evaluated = { dynamicProps: true, dynamicItems: false };
export const ajvGetProjectBySlugResponse = validate23;
const schema68 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id_or_slug}~1projects~1{project_slug}/get/responses/200/content/application~1json/schema",
};
function validate24(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate24.evaluated;
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
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern0.test(data0)) {
          const err6 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      } else {
        const err7 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err8 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/components/schemas/ProjectName/type",
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
    if (data.teamId !== undefined) {
      let data3 = data.teamId;
      if (typeof data3 === "string") {
        if (!pattern0.test(data3)) {
          const err10 = {
            instancePath: instancePath + "/teamId",
            schemaPath: "#/components/schemas/TeamId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      } else {
        const err11 = {
          instancePath: instancePath + "/teamId",
          schemaPath: "#/components/schemas/TeamId/type",
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
    if (data.teamSlug !== undefined) {
      if (typeof data.teamSlug !== "string") {
        const err12 = {
          instancePath: instancePath + "/teamSlug",
          schemaPath: "#/components/schemas/TeamSlug/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.createTime !== undefined) {
      let data5 = data.createTime;
      if (!(typeof data5 == "number" && !(data5 % 1) && !isNaN(data5))) {
        const err13 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/properties/createTime/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.prodDeploymentName !== undefined) {
      let data6 = data.prodDeploymentName;
      if (typeof data6 !== "string" && data6 !== null) {
        const err14 = {
          instancePath: instancePath + "/prodDeploymentName",
          schemaPath: "#/properties/prodDeploymentName/type",
          keyword: "type",
          params: { type: schema7.properties.prodDeploymentName.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.devDeploymentName !== undefined) {
      let data7 = data.devDeploymentName;
      if (typeof data7 !== "string" && data7 !== null) {
        const err15 = {
          instancePath: instancePath + "/devDeploymentName",
          schemaPath: "#/properties/devDeploymentName/type",
          keyword: "type",
          params: { type: schema7.properties.devDeploymentName.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
  } else {
    const err16 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err16];
    } else {
      vErrors.push(err16);
    }
    errors++;
  }
  validate24.errors = vErrors;
  return errors === 0;
}
validate24.evaluated = {
  props: {
    id: true,
    name: true,
    slug: true,
    teamId: true,
    teamSlug: true,
    createTime: true,
    prodDeploymentName: true,
    devDeploymentName: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
function validate23(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate23.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate24(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
    errors = vErrors.length;
  }
  validate23.errors = vErrors;
  return errors === 0;
}
validate23.evaluated = {
  props: {
    id: true,
    name: true,
    slug: true,
    teamId: true,
    teamSlug: true,
    createTime: true,
    prodDeploymentName: true,
    devDeploymentName: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvCreateDeploymentResponse = validate26;
const schema75 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1projects~1{project_id}~1create_deployment/post/responses/200/content/application~1json/schema",
};
function validate27(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate27.evaluated;
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
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern0.test(data0)) {
          const err11 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/DeploymentId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      } else {
        const err12 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/DeploymentId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err13 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/oneOf/0/properties/name/type",
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
    if (data.createTime !== undefined) {
      let data2 = data.createTime;
      if (!(typeof data2 == "number" && !(data2 % 1) && !isNaN(data2))) {
        const err14 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/oneOf/0/properties/createTime/type",
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
    }
    if (data.lastDeployTime !== undefined) {
      let data3 = data.lastDeployTime;
      if (!(typeof data3 == "number" && !(data3 % 1) && !isNaN(data3)) && data3 !== null) {
        const err15 = {
          instancePath: instancePath + "/lastDeployTime",
          schemaPath: "#/oneOf/0/properties/lastDeployTime/type",
          keyword: "type",
          params: { type: schema24.oneOf[0].properties.lastDeployTime.type },
          message: "must be integer,null",
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.deploymentType !== undefined) {
      let data4 = data.deploymentType;
      if (typeof data4 !== "string") {
        const err16 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/type",
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
      if (!(data4 === "dev" || data4 === "prod" || data4 === "preview" || data4 === "custom")) {
        const err17 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/enum",
          keyword: "enum",
          params: { allowedValues: schema26.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    if (data.projectId !== undefined) {
      let data5 = data.projectId;
      if (typeof data5 === "string") {
        if (!pattern0.test(data5)) {
          const err18 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
      } else {
        const err19 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
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
    }
    if (data.creator !== undefined) {
      let data6 = data.creator;
      const _errs19 = errors;
      let valid5 = false;
      let passing1 = null;
      const _errs20 = errors;
      if (data6 !== null) {
        const err20 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/oneOf/0/properties/creator/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
      var _valid1 = _errs20 === errors;
      if (_valid1) {
        valid5 = true;
        passing1 = 0;
      }
      const _errs22 = errors;
      if (typeof data6 === "string") {
        if (!pattern0.test(data6)) {
          const err21 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      } else {
        const err22 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
      var _valid1 = _errs22 === errors;
      if (_valid1 && valid5) {
        valid5 = false;
        passing1 = [passing1, 1];
      } else {
        if (_valid1) {
          valid5 = true;
          passing1 = 1;
        }
      }
      if (!valid5) {
        const err23 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/oneOf/0/properties/creator/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing1 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      } else {
        errors = _errs19;
        if (vErrors !== null) {
          if (_errs19) {
            vErrors.length = _errs19;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.previewIdentifier !== undefined) {
      let data7 = data.previewIdentifier;
      const _errs26 = errors;
      let valid7 = false;
      let passing2 = null;
      const _errs27 = errors;
      if (data7 !== null) {
        const err24 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/0/properties/previewIdentifier/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
      var _valid2 = _errs27 === errors;
      if (_valid2) {
        valid7 = true;
        passing2 = 0;
      }
      const _errs29 = errors;
      if (typeof data7 !== "string") {
        const err25 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/components/schemas/PreviewDeploymentIdentifier/type",
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
      var _valid2 = _errs29 === errors;
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
        const err26 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/0/properties/previewIdentifier/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing2 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
        }
        errors++;
      } else {
        errors = _errs26;
        if (vErrors !== null) {
          if (_errs26) {
            vErrors.length = _errs26;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.region !== undefined) {
      let data8 = data.region;
      if (typeof data8 !== "string") {
        const err27 = {
          instancePath: instancePath + "/region",
          schemaPath: "#/components/schemas/RegionName/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
      if (
        !(
          data8 === "aws-us-east-1" ||
          data8 === "aws-eu-west-1" ||
          data8 === "aws-ca-central-1" ||
          data8 === "aws-ap-southeast-2"
        )
      ) {
        const err28 = {
          instancePath: instancePath + "/region",
          schemaPath: "#/components/schemas/RegionName/enum",
          keyword: "enum",
          params: { allowedValues: schema30.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err28];
        } else {
          vErrors.push(err28);
        }
        errors++;
      }
    }
    if (data.isDefault !== undefined) {
      if (typeof data.isDefault !== "boolean") {
        const err29 = {
          instancePath: instancePath + "/isDefault",
          schemaPath: "#/components/schemas/IsDefaultDeployment/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
        };
        if (vErrors === null) {
          vErrors = [err29];
        } else {
          vErrors.push(err29);
        }
        errors++;
      }
    }
    if (data.reference !== undefined) {
      if (typeof data.reference !== "string") {
        const err30 = {
          instancePath: instancePath + "/reference",
          schemaPath: "#/components/schemas/DeploymentReference/type",
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
    }
    if (data.dashboardEditConfirmation !== undefined) {
      let data11 = data.dashboardEditConfirmation;
      if (typeof data11 !== "boolean" && data11 !== null) {
        const err31 = {
          instancePath: instancePath + "/dashboardEditConfirmation",
          schemaPath: "#/oneOf/0/properties/dashboardEditConfirmation/type",
          keyword: "type",
          params: { type: schema24.oneOf[0].properties.dashboardEditConfirmation.type },
          message: "must be boolean,null",
        };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      }
    }
    if (data.deploymentUrl !== undefined) {
      if (typeof data.deploymentUrl !== "string") {
        const err32 = {
          instancePath: instancePath + "/deploymentUrl",
          schemaPath: "#/oneOf/0/properties/deploymentUrl/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err32];
        } else {
          vErrors.push(err32);
        }
        errors++;
      }
    }
    if (data.expiresAt !== undefined) {
      let data13 = data.expiresAt;
      if (!(typeof data13 == "number" && !(data13 % 1) && !isNaN(data13)) && data13 !== null) {
        const err33 = {
          instancePath: instancePath + "/expiresAt",
          schemaPath: "#/oneOf/0/properties/expiresAt/type",
          keyword: "type",
          params: { type: schema24.oneOf[0].properties.expiresAt.type },
          message: "must be integer,null",
        };
        if (vErrors === null) {
          vErrors = [err33];
        } else {
          vErrors.push(err33);
        }
        errors++;
      }
    }
    if (data.class !== undefined) {
      if (typeof data.class !== "string") {
        const err34 = {
          instancePath: instancePath + "/class",
          schemaPath: "#/oneOf/0/properties/class/type",
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
    if (data.sendLogsToClient !== undefined) {
      let data15 = data.sendLogsToClient;
      if (typeof data15 !== "boolean" && data15 !== null) {
        const err35 = {
          instancePath: instancePath + "/sendLogsToClient",
          schemaPath: "#/oneOf/0/properties/sendLogsToClient/type",
          keyword: "type",
          params: { type: schema24.oneOf[0].properties.sendLogsToClient.type },
          message: "must be boolean,null",
        };
        if (vErrors === null) {
          vErrors = [err35];
        } else {
          vErrors.push(err35);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      let data16 = data.kind;
      if (typeof data16 !== "string") {
        const err36 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/0/properties/kind/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err36];
        } else {
          vErrors.push(err36);
        }
        errors++;
      }
      if (!(data16 === "cloud")) {
        const err37 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/0/properties/kind/enum",
          keyword: "enum",
          params: { allowedValues: schema24.oneOf[0].properties.kind.enum },
          message: "must be equal to one of the allowed values",
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
    props0.id = true;
    props0.name = true;
    props0.createTime = true;
    props0.lastDeployTime = true;
    props0.deploymentType = true;
    props0.projectId = true;
    props0.creator = true;
    props0.previewIdentifier = true;
    props0.region = true;
    props0.isDefault = true;
    props0.reference = true;
    props0.dashboardEditConfirmation = true;
    props0.deploymentUrl = true;
    props0.expiresAt = true;
    props0.class = true;
    props0.sendLogsToClient = true;
    props0.kind = true;
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
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err48 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/oneOf/1/properties/name/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err48];
        } else {
          vErrors.push(err48);
        }
        errors++;
      }
    }
    if (data.createTime !== undefined) {
      let data18 = data.createTime;
      if (!(typeof data18 == "number" && !(data18 % 1) && !isNaN(data18))) {
        const err49 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/oneOf/1/properties/createTime/type",
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
    }
    if (data.deploymentType !== undefined) {
      let data19 = data.deploymentType;
      if (typeof data19 !== "string") {
        const err50 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err50];
        } else {
          vErrors.push(err50);
        }
        errors++;
      }
      if (!(data19 === "dev" || data19 === "prod" || data19 === "preview" || data19 === "custom")) {
        const err51 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/enum",
          keyword: "enum",
          params: { allowedValues: schema26.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err51];
        } else {
          vErrors.push(err51);
        }
        errors++;
      }
    }
    if (data.projectId !== undefined) {
      let data20 = data.projectId;
      if (typeof data20 === "string") {
        if (!pattern0.test(data20)) {
          const err52 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err52];
          } else {
            vErrors.push(err52);
          }
          errors++;
        }
      } else {
        const err53 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
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
    if (data.creator !== undefined) {
      let data21 = data.creator;
      if (typeof data21 === "string") {
        if (!pattern0.test(data21)) {
          const err54 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err54];
          } else {
            vErrors.push(err54);
          }
          errors++;
        }
      } else {
        const err55 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
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
    }
    if (data.previewIdentifier !== undefined) {
      let data22 = data.previewIdentifier;
      const _errs69 = errors;
      let valid16 = false;
      let passing3 = null;
      const _errs70 = errors;
      if (data22 !== null) {
        const err56 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/1/properties/previewIdentifier/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err56];
        } else {
          vErrors.push(err56);
        }
        errors++;
      }
      var _valid3 = _errs70 === errors;
      if (_valid3) {
        valid16 = true;
        passing3 = 0;
      }
      const _errs72 = errors;
      if (typeof data22 !== "string") {
        const err57 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/components/schemas/PreviewDeploymentIdentifier/type",
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
      var _valid3 = _errs72 === errors;
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
        const err58 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/1/properties/previewIdentifier/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing3 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err58];
        } else {
          vErrors.push(err58);
        }
        errors++;
      } else {
        errors = _errs69;
        if (vErrors !== null) {
          if (_errs69) {
            vErrors.length = _errs69;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.port !== undefined) {
      let data23 = data.port;
      if (!(typeof data23 == "number" && !(data23 % 1) && !isNaN(data23))) {
        const err59 = {
          instancePath: instancePath + "/port",
          schemaPath: "#/oneOf/1/properties/port/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err59];
        } else {
          vErrors.push(err59);
        }
        errors++;
      }
      if (typeof data23 == "number") {
        if (data23 < 0 || isNaN(data23)) {
          const err60 = {
            instancePath: instancePath + "/port",
            schemaPath: "#/oneOf/1/properties/port/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err60];
          } else {
            vErrors.push(err60);
          }
          errors++;
        }
      }
    }
    if (data.deviceName !== undefined) {
      if (typeof data.deviceName !== "string") {
        const err61 = {
          instancePath: instancePath + "/deviceName",
          schemaPath: "#/components/schemas/DeviceName/type",
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
    }
    if (data.isActive !== undefined) {
      if (typeof data.isActive !== "boolean") {
        const err62 = {
          instancePath: instancePath + "/isActive",
          schemaPath: "#/oneOf/1/properties/isActive/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
        };
        if (vErrors === null) {
          vErrors = [err62];
        } else {
          vErrors.push(err62);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      let data26 = data.kind;
      if (typeof data26 !== "string") {
        const err63 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/1/properties/kind/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err63];
        } else {
          vErrors.push(err63);
        }
        errors++;
      }
      if (!(data26 === "local")) {
        const err64 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/1/properties/kind/enum",
          keyword: "enum",
          params: { allowedValues: schema24.oneOf[1].properties.kind.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err64];
        } else {
          vErrors.push(err64);
        }
        errors++;
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
        props0.name = true;
        props0.createTime = true;
        props0.deploymentType = true;
        props0.projectId = true;
        props0.creator = true;
        props0.previewIdentifier = true;
        props0.port = true;
        props0.deviceName = true;
        props0.isActive = true;
        props0.kind = true;
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
  validate27.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate27.evaluated = { dynamicProps: true, dynamicItems: false };
function validate26(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate26.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate27(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
    errors = vErrors.length;
  } else {
    var props0 = validate27.evaluated.props;
  }
  validate26.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate26.evaluated = { dynamicProps: true, dynamicItems: false };
export const ajvPlatformGetDeploymentResponse = validate29;
const schema90 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1deployments~1{deployment_name}/get/responses/200/content/application~1json/schema",
};
function validate30(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate30.evaluated;
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
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern0.test(data0)) {
          const err11 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/DeploymentId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      } else {
        const err12 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/DeploymentId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err13 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/oneOf/0/properties/name/type",
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
    if (data.createTime !== undefined) {
      let data2 = data.createTime;
      if (!(typeof data2 == "number" && !(data2 % 1) && !isNaN(data2))) {
        const err14 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/oneOf/0/properties/createTime/type",
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
    }
    if (data.lastDeployTime !== undefined) {
      let data3 = data.lastDeployTime;
      if (!(typeof data3 == "number" && !(data3 % 1) && !isNaN(data3)) && data3 !== null) {
        const err15 = {
          instancePath: instancePath + "/lastDeployTime",
          schemaPath: "#/oneOf/0/properties/lastDeployTime/type",
          keyword: "type",
          params: { type: schema24.oneOf[0].properties.lastDeployTime.type },
          message: "must be integer,null",
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.deploymentType !== undefined) {
      let data4 = data.deploymentType;
      if (typeof data4 !== "string") {
        const err16 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/type",
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
      if (!(data4 === "dev" || data4 === "prod" || data4 === "preview" || data4 === "custom")) {
        const err17 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/enum",
          keyword: "enum",
          params: { allowedValues: schema26.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    if (data.projectId !== undefined) {
      let data5 = data.projectId;
      if (typeof data5 === "string") {
        if (!pattern0.test(data5)) {
          const err18 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
      } else {
        const err19 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
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
    }
    if (data.creator !== undefined) {
      let data6 = data.creator;
      const _errs19 = errors;
      let valid5 = false;
      let passing1 = null;
      const _errs20 = errors;
      if (data6 !== null) {
        const err20 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/oneOf/0/properties/creator/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
      var _valid1 = _errs20 === errors;
      if (_valid1) {
        valid5 = true;
        passing1 = 0;
      }
      const _errs22 = errors;
      if (typeof data6 === "string") {
        if (!pattern0.test(data6)) {
          const err21 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      } else {
        const err22 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
      var _valid1 = _errs22 === errors;
      if (_valid1 && valid5) {
        valid5 = false;
        passing1 = [passing1, 1];
      } else {
        if (_valid1) {
          valid5 = true;
          passing1 = 1;
        }
      }
      if (!valid5) {
        const err23 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/oneOf/0/properties/creator/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing1 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      } else {
        errors = _errs19;
        if (vErrors !== null) {
          if (_errs19) {
            vErrors.length = _errs19;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.previewIdentifier !== undefined) {
      let data7 = data.previewIdentifier;
      const _errs26 = errors;
      let valid7 = false;
      let passing2 = null;
      const _errs27 = errors;
      if (data7 !== null) {
        const err24 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/0/properties/previewIdentifier/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
      var _valid2 = _errs27 === errors;
      if (_valid2) {
        valid7 = true;
        passing2 = 0;
      }
      const _errs29 = errors;
      if (typeof data7 !== "string") {
        const err25 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/components/schemas/PreviewDeploymentIdentifier/type",
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
      var _valid2 = _errs29 === errors;
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
        const err26 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/0/properties/previewIdentifier/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing2 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
        }
        errors++;
      } else {
        errors = _errs26;
        if (vErrors !== null) {
          if (_errs26) {
            vErrors.length = _errs26;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.region !== undefined) {
      let data8 = data.region;
      if (typeof data8 !== "string") {
        const err27 = {
          instancePath: instancePath + "/region",
          schemaPath: "#/components/schemas/RegionName/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
      if (
        !(
          data8 === "aws-us-east-1" ||
          data8 === "aws-eu-west-1" ||
          data8 === "aws-ca-central-1" ||
          data8 === "aws-ap-southeast-2"
        )
      ) {
        const err28 = {
          instancePath: instancePath + "/region",
          schemaPath: "#/components/schemas/RegionName/enum",
          keyword: "enum",
          params: { allowedValues: schema30.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err28];
        } else {
          vErrors.push(err28);
        }
        errors++;
      }
    }
    if (data.isDefault !== undefined) {
      if (typeof data.isDefault !== "boolean") {
        const err29 = {
          instancePath: instancePath + "/isDefault",
          schemaPath: "#/components/schemas/IsDefaultDeployment/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
        };
        if (vErrors === null) {
          vErrors = [err29];
        } else {
          vErrors.push(err29);
        }
        errors++;
      }
    }
    if (data.reference !== undefined) {
      if (typeof data.reference !== "string") {
        const err30 = {
          instancePath: instancePath + "/reference",
          schemaPath: "#/components/schemas/DeploymentReference/type",
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
    }
    if (data.dashboardEditConfirmation !== undefined) {
      let data11 = data.dashboardEditConfirmation;
      if (typeof data11 !== "boolean" && data11 !== null) {
        const err31 = {
          instancePath: instancePath + "/dashboardEditConfirmation",
          schemaPath: "#/oneOf/0/properties/dashboardEditConfirmation/type",
          keyword: "type",
          params: { type: schema24.oneOf[0].properties.dashboardEditConfirmation.type },
          message: "must be boolean,null",
        };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      }
    }
    if (data.deploymentUrl !== undefined) {
      if (typeof data.deploymentUrl !== "string") {
        const err32 = {
          instancePath: instancePath + "/deploymentUrl",
          schemaPath: "#/oneOf/0/properties/deploymentUrl/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err32];
        } else {
          vErrors.push(err32);
        }
        errors++;
      }
    }
    if (data.expiresAt !== undefined) {
      let data13 = data.expiresAt;
      if (!(typeof data13 == "number" && !(data13 % 1) && !isNaN(data13)) && data13 !== null) {
        const err33 = {
          instancePath: instancePath + "/expiresAt",
          schemaPath: "#/oneOf/0/properties/expiresAt/type",
          keyword: "type",
          params: { type: schema24.oneOf[0].properties.expiresAt.type },
          message: "must be integer,null",
        };
        if (vErrors === null) {
          vErrors = [err33];
        } else {
          vErrors.push(err33);
        }
        errors++;
      }
    }
    if (data.class !== undefined) {
      if (typeof data.class !== "string") {
        const err34 = {
          instancePath: instancePath + "/class",
          schemaPath: "#/oneOf/0/properties/class/type",
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
    if (data.sendLogsToClient !== undefined) {
      let data15 = data.sendLogsToClient;
      if (typeof data15 !== "boolean" && data15 !== null) {
        const err35 = {
          instancePath: instancePath + "/sendLogsToClient",
          schemaPath: "#/oneOf/0/properties/sendLogsToClient/type",
          keyword: "type",
          params: { type: schema24.oneOf[0].properties.sendLogsToClient.type },
          message: "must be boolean,null",
        };
        if (vErrors === null) {
          vErrors = [err35];
        } else {
          vErrors.push(err35);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      let data16 = data.kind;
      if (typeof data16 !== "string") {
        const err36 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/0/properties/kind/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err36];
        } else {
          vErrors.push(err36);
        }
        errors++;
      }
      if (!(data16 === "cloud")) {
        const err37 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/0/properties/kind/enum",
          keyword: "enum",
          params: { allowedValues: schema24.oneOf[0].properties.kind.enum },
          message: "must be equal to one of the allowed values",
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
    props0.id = true;
    props0.name = true;
    props0.createTime = true;
    props0.lastDeployTime = true;
    props0.deploymentType = true;
    props0.projectId = true;
    props0.creator = true;
    props0.previewIdentifier = true;
    props0.region = true;
    props0.isDefault = true;
    props0.reference = true;
    props0.dashboardEditConfirmation = true;
    props0.deploymentUrl = true;
    props0.expiresAt = true;
    props0.class = true;
    props0.sendLogsToClient = true;
    props0.kind = true;
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
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err48 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/oneOf/1/properties/name/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err48];
        } else {
          vErrors.push(err48);
        }
        errors++;
      }
    }
    if (data.createTime !== undefined) {
      let data18 = data.createTime;
      if (!(typeof data18 == "number" && !(data18 % 1) && !isNaN(data18))) {
        const err49 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/oneOf/1/properties/createTime/type",
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
    }
    if (data.deploymentType !== undefined) {
      let data19 = data.deploymentType;
      if (typeof data19 !== "string") {
        const err50 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err50];
        } else {
          vErrors.push(err50);
        }
        errors++;
      }
      if (!(data19 === "dev" || data19 === "prod" || data19 === "preview" || data19 === "custom")) {
        const err51 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/enum",
          keyword: "enum",
          params: { allowedValues: schema26.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err51];
        } else {
          vErrors.push(err51);
        }
        errors++;
      }
    }
    if (data.projectId !== undefined) {
      let data20 = data.projectId;
      if (typeof data20 === "string") {
        if (!pattern0.test(data20)) {
          const err52 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err52];
          } else {
            vErrors.push(err52);
          }
          errors++;
        }
      } else {
        const err53 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
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
    if (data.creator !== undefined) {
      let data21 = data.creator;
      if (typeof data21 === "string") {
        if (!pattern0.test(data21)) {
          const err54 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err54];
          } else {
            vErrors.push(err54);
          }
          errors++;
        }
      } else {
        const err55 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
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
    }
    if (data.previewIdentifier !== undefined) {
      let data22 = data.previewIdentifier;
      const _errs69 = errors;
      let valid16 = false;
      let passing3 = null;
      const _errs70 = errors;
      if (data22 !== null) {
        const err56 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/1/properties/previewIdentifier/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err56];
        } else {
          vErrors.push(err56);
        }
        errors++;
      }
      var _valid3 = _errs70 === errors;
      if (_valid3) {
        valid16 = true;
        passing3 = 0;
      }
      const _errs72 = errors;
      if (typeof data22 !== "string") {
        const err57 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/components/schemas/PreviewDeploymentIdentifier/type",
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
      var _valid3 = _errs72 === errors;
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
        const err58 = {
          instancePath: instancePath + "/previewIdentifier",
          schemaPath: "#/oneOf/1/properties/previewIdentifier/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing3 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err58];
        } else {
          vErrors.push(err58);
        }
        errors++;
      } else {
        errors = _errs69;
        if (vErrors !== null) {
          if (_errs69) {
            vErrors.length = _errs69;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.port !== undefined) {
      let data23 = data.port;
      if (!(typeof data23 == "number" && !(data23 % 1) && !isNaN(data23))) {
        const err59 = {
          instancePath: instancePath + "/port",
          schemaPath: "#/oneOf/1/properties/port/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err59];
        } else {
          vErrors.push(err59);
        }
        errors++;
      }
      if (typeof data23 == "number") {
        if (data23 < 0 || isNaN(data23)) {
          const err60 = {
            instancePath: instancePath + "/port",
            schemaPath: "#/oneOf/1/properties/port/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err60];
          } else {
            vErrors.push(err60);
          }
          errors++;
        }
      }
    }
    if (data.deviceName !== undefined) {
      if (typeof data.deviceName !== "string") {
        const err61 = {
          instancePath: instancePath + "/deviceName",
          schemaPath: "#/components/schemas/DeviceName/type",
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
    }
    if (data.isActive !== undefined) {
      if (typeof data.isActive !== "boolean") {
        const err62 = {
          instancePath: instancePath + "/isActive",
          schemaPath: "#/oneOf/1/properties/isActive/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
        };
        if (vErrors === null) {
          vErrors = [err62];
        } else {
          vErrors.push(err62);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      let data26 = data.kind;
      if (typeof data26 !== "string") {
        const err63 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/1/properties/kind/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err63];
        } else {
          vErrors.push(err63);
        }
        errors++;
      }
      if (!(data26 === "local")) {
        const err64 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/1/properties/kind/enum",
          keyword: "enum",
          params: { allowedValues: schema24.oneOf[1].properties.kind.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err64];
        } else {
          vErrors.push(err64);
        }
        errors++;
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
        props0.name = true;
        props0.createTime = true;
        props0.deploymentType = true;
        props0.projectId = true;
        props0.creator = true;
        props0.previewIdentifier = true;
        props0.port = true;
        props0.deviceName = true;
        props0.isActive = true;
        props0.kind = true;
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
  validate30.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate30.evaluated = { dynamicProps: true, dynamicItems: false };
function validate29(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate29.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate30(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
    errors = vErrors.length;
  } else {
    var props0 = validate30.evaluated.props;
  }
  validate29.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate29.evaluated = { dynamicProps: true, dynamicItems: false };
export const ajvListDeploymentClassesResponse = validate32;
const schema105 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1list_deployment_classes/get/responses/200/content/application~1json/schema",
};
const schema106 = {
  type: "object",
  required: ["items"],
  properties: {
    items: { type: "array", items: { $ref: "#/components/schemas/DeploymentClassMetadata" } },
  },
};
const schema107 = {
  type: "object",
  required: ["type", "available"],
  properties: {
    type: { $ref: "#/components/schemas/DeploymentClass" },
    available: { type: "boolean" },
  },
};
const schema108 = { type: "string", enum: ["s16", "s256", "d1024", "d2048"] };
function validate34(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate34.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.type === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "type" },
        message: "must have required property '" + "type" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.available === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "available" },
        message: "must have required property '" + "available" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.type !== undefined) {
      let data0 = data.type;
      if (typeof data0 !== "string") {
        const err2 = {
          instancePath: instancePath + "/type",
          schemaPath: "#/components/schemas/DeploymentClass/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
      if (!(data0 === "s16" || data0 === "s256" || data0 === "d1024" || data0 === "d2048")) {
        const err3 = {
          instancePath: instancePath + "/type",
          schemaPath: "#/components/schemas/DeploymentClass/enum",
          keyword: "enum",
          params: { allowedValues: schema108.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.available !== undefined) {
      if (typeof data.available !== "boolean") {
        const err4 = {
          instancePath: instancePath + "/available",
          schemaPath: "#/properties/available/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
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
  validate34.errors = vErrors;
  return errors === 0;
}
validate34.evaluated = {
  props: { type: true, available: true },
  dynamicProps: false,
  dynamicItems: false,
};
function validate33(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate33.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.items === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "items" },
        message: "must have required property '" + "items" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.items !== undefined) {
      let data0 = data.items;
      if (Array.isArray(data0)) {
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate34(data0[i0], {
              instancePath: instancePath + "/items/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate34.errors : vErrors.concat(validate34.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err1 = {
          instancePath: instancePath + "/items",
          schemaPath: "#/properties/items/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
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
  validate33.errors = vErrors;
  return errors === 0;
}
validate33.evaluated = { props: { items: true }, dynamicProps: false, dynamicItems: false };
function validate32(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate32.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate33(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate33.errors : vErrors.concat(validate33.errors);
    errors = vErrors.length;
  }
  validate32.errors = vErrors;
  return errors === 0;
}
validate32.evaluated = { props: { items: true }, dynamicProps: false, dynamicItems: false };
export const ajvListDeploymentRegionsResponse = validate37;
const schema109 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1list_deployment_regions/get/responses/200/content/application~1json/schema",
};
const schema110 = {
  type: "object",
  required: ["items"],
  properties: {
    items: { type: "array", items: { $ref: "#/components/schemas/DeploymentRegionMetadata" } },
  },
};
const schema111 = {
  type: "object",
  required: ["name", "displayName", "available"],
  properties: {
    name: { $ref: "#/components/schemas/RegionName" },
    displayName: { type: "string" },
    available: { type: "boolean" },
  },
};
function validate39(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate39.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.name === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "name" },
        message: "must have required property '" + "name" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.displayName === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "displayName" },
        message: "must have required property '" + "displayName" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.available === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "available" },
        message: "must have required property '" + "available" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.name !== undefined) {
      let data0 = data.name;
      if (typeof data0 !== "string") {
        const err3 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/components/schemas/RegionName/type",
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
      if (
        !(
          data0 === "aws-us-east-1" ||
          data0 === "aws-eu-west-1" ||
          data0 === "aws-ca-central-1" ||
          data0 === "aws-ap-southeast-2"
        )
      ) {
        const err4 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/components/schemas/RegionName/enum",
          keyword: "enum",
          params: { allowedValues: schema30.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.displayName !== undefined) {
      if (typeof data.displayName !== "string") {
        const err5 = {
          instancePath: instancePath + "/displayName",
          schemaPath: "#/properties/displayName/type",
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
    if (data.available !== undefined) {
      if (typeof data.available !== "boolean") {
        const err6 = {
          instancePath: instancePath + "/available",
          schemaPath: "#/properties/available/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
  } else {
    const err7 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err7];
    } else {
      vErrors.push(err7);
    }
    errors++;
  }
  validate39.errors = vErrors;
  return errors === 0;
}
validate39.evaluated = {
  props: { name: true, displayName: true, available: true },
  dynamicProps: false,
  dynamicItems: false,
};
function validate38(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate38.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.items === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "items" },
        message: "must have required property '" + "items" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.items !== undefined) {
      let data0 = data.items;
      if (Array.isArray(data0)) {
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate39(data0[i0], {
              instancePath: instancePath + "/items/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate39.errors : vErrors.concat(validate39.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err1 = {
          instancePath: instancePath + "/items",
          schemaPath: "#/properties/items/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
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
  validate38.errors = vErrors;
  return errors === 0;
}
validate38.evaluated = { props: { items: true }, dynamicProps: false, dynamicItems: false };
function validate37(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate37.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate38(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
    errors = vErrors.length;
  }
  validate37.errors = vErrors;
  return errors === 0;
}
validate37.evaluated = { props: { items: true }, dynamicProps: false, dynamicItems: false };
export const ajvListDeploymentsForTeamResponse = validate42;
const schema113 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1list_deployments/get/responses/200/content/application~1json/schema",
};
const schema114 = {
  type: "object",
  required: ["items", "pagination"],
  properties: {
    items: { type: "array", items: { $ref: "#/components/schemas/PlatformDeploymentResponse" } },
    pagination: { $ref: "#/components/schemas/PaginationMetadata" },
  },
};
function validate43(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate43.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.items === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "items" },
        message: "must have required property '" + "items" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.pagination === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "pagination" },
        message: "must have required property '" + "pagination" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.items !== undefined) {
      let data0 = data.items;
      if (Array.isArray(data0)) {
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate14(data0[i0], {
              instancePath: instancePath + "/items/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate14.errors : vErrors.concat(validate14.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err2 = {
          instancePath: instancePath + "/items",
          schemaPath: "#/properties/items/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.pagination !== undefined) {
      let data2 = data.pagination;
      if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
        if (data2.hasMore === undefined) {
          const err3 = {
            instancePath: instancePath + "/pagination",
            schemaPath: "#/components/schemas/PaginationMetadata/required",
            keyword: "required",
            params: { missingProperty: "hasMore" },
            message: "must have required property '" + "hasMore" + "'",
          };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data2.hasMore !== undefined) {
          if (typeof data2.hasMore !== "boolean") {
            const err4 = {
              instancePath: instancePath + "/pagination/hasMore",
              schemaPath: "#/components/schemas/PaginationMetadata/properties/hasMore/type",
              keyword: "type",
              params: { type: "boolean" },
              message: "must be boolean",
            };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data2.nextCursor !== undefined) {
          let data4 = data2.nextCursor;
          if (typeof data4 !== "string" && data4 !== null) {
            const err5 = {
              instancePath: instancePath + "/pagination/nextCursor",
              schemaPath: "#/components/schemas/PaginationMetadata/properties/nextCursor/type",
              keyword: "type",
              params: { type: schema21.properties.nextCursor.type },
              message: "must be string,null",
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
      } else {
        const err6 = {
          instancePath: instancePath + "/pagination",
          schemaPath: "#/components/schemas/PaginationMetadata/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
  } else {
    const err7 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err7];
    } else {
      vErrors.push(err7);
    }
    errors++;
  }
  validate43.errors = vErrors;
  return errors === 0;
}
validate43.evaluated = {
  props: { items: true, pagination: true },
  dynamicProps: false,
  dynamicItems: false,
};
function validate42(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate42.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate43(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate43.errors : vErrors.concat(validate43.errors);
    errors = vErrors.length;
  }
  validate42.errors = vErrors;
  return errors === 0;
}
validate42.evaluated = {
  props: { items: true, pagination: true },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvListLocalDeploymentsForTeamResponse = validate46;
const schema116 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1list_local_deployments/get/responses/200/content/application~1json/schema",
};
const schema117 = {
  type: "object",
  required: ["items"],
  properties: {
    items: { type: "array", items: { $ref: "#/components/schemas/PlatformDeploymentResponse" } },
  },
};
function validate47(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate47.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.items === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "items" },
        message: "must have required property '" + "items" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.items !== undefined) {
      let data0 = data.items;
      if (Array.isArray(data0)) {
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate14(data0[i0], {
              instancePath: instancePath + "/items/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate14.errors : vErrors.concat(validate14.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err1 = {
          instancePath: instancePath + "/items",
          schemaPath: "#/properties/items/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
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
  validate47.errors = vErrors;
  return errors === 0;
}
validate47.evaluated = { props: { items: true }, dynamicProps: false, dynamicItems: false };
function validate46(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate46.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate47(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate47.errors : vErrors.concat(validate47.errors);
    errors = vErrors.length;
  }
  validate46.errors = vErrors;
  return errors === 0;
}
validate46.evaluated = { props: { items: true }, dynamicProps: false, dynamicItems: false };
export const ajvMintAiGatewayJwtResponse = validate50;
const schema118 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1deployments~1{deployment_name}~1mint_ai_gateway_jwt/post/responses/200/content/application~1json/schema",
};
const schema119 = {
  type: "object",
  required: ["token"],
  properties: { token: { type: "string" } },
};
function validate50(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate50.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.token === undefined) {
      const err0 = {
        instancePath,
        schemaPath:
          "https://api.convex.dev/v1/openapi.json#/paths/~1deployments~1{deployment_name}~1mint_ai_gateway_jwt/post/responses/200/content/application~1json/schema/required",
        keyword: "required",
        params: { missingProperty: "token" },
        message: "must have required property '" + "token" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.token !== undefined) {
      if (typeof data.token !== "string") {
        const err1 = {
          instancePath: instancePath + "/token",
          schemaPath:
            "https://api.convex.dev/v1/openapi.json#/paths/~1deployments~1{deployment_name}~1mint_ai_gateway_jwt/post/responses/200/content/application~1json/schema/properties/token/type",
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
      schemaPath:
        "https://api.convex.dev/v1/openapi.json#/paths/~1deployments~1{deployment_name}~1mint_ai_gateway_jwt/post/responses/200/content/application~1json/schema/type",
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
  validate50.errors = vErrors;
  return errors === 0;
}
validate50.evaluated = { props: { token: true }, dynamicProps: false, dynamicItems: false };
export const ajvCreateDeployKeyResponse = validate51;
const schema120 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1deployments~1{deployment_name}~1create_deploy_key/post/responses/200/content/application~1json/schema",
};
const schema121 = {
  type: "object",
  required: ["deployKey"],
  properties: {
    deployKey: { $ref: "#/components/schemas/AdminKey", description: "The generated deploy key." },
  },
};
const schema122 = { type: "string", description: "Encrypted admin key" };
function validate52(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate52.evaluated;
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
  validate52.errors = vErrors;
  return errors === 0;
}
validate52.evaluated = { props: { deployKey: true }, dynamicProps: false, dynamicItems: false };
function validate51(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate51.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate52(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate52.errors : vErrors.concat(validate52.errors);
    errors = vErrors.length;
  }
  validate51.errors = vErrors;
  return errors === 0;
}
validate51.evaluated = { props: { deployKey: true }, dynamicProps: false, dynamicItems: false };
export const ajvListDeployKeysResponse = validate54;
const schema123 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1deployments~1{deployment_name}~1list_deploy_keys/get/responses/200/content/application~1json/schema",
};
const schema124 = {
  type: "array",
  items: { $ref: "#/components/schemas/PlatformDeployKeyResponse" },
};
const schema125 = {
  type: "object",
  required: ["id", "name", "creationTime", "allowedActions"],
  properties: {
    id: {
      $ref: "#/components/schemas/AccessTokenId",
      description: "Stable identifier for this deploy key.",
    },
    name: { type: "string", description: "The name given to the deploy key at creation." },
    creationTime: {
      type: "integer",
      format: "int64",
      description: "Timestamp in milliseconds when this token was created.",
    },
    lastUsedTime: {
      type: ["integer", "null"],
      format: "int64",
      description: "Timestamp in milliseconds when this token was last used (if ever).",
    },
    expiresAt: {
      type: ["integer", "null"],
      format: "int64",
      description: "Timestamp in milliseconds when this deploy key will expire.",
    },
    creator: {
      oneOf: [
        { type: "null" },
        {
          $ref: "#/components/schemas/MemberId",
          description: "The member ID that created this deploy key (if available).",
        },
      ],
    },
    managedBy: {
      oneOf: [
        { type: "null" },
        {
          $ref: "#/components/schemas/ManagedBy",
          description: "The external integration that manages this deploy key, if any.",
        },
      ],
    },
    allowedActions: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "deployment:deploy",
          "deployment:env:view",
          "deployment:env:write",
          "deployment:pause",
          "deployment:unpause",
          "deployment:logs:view",
          "deployment:metrics:view",
          "deployment:integrations:view",
          "deployment:integrations:write",
          "deployment:data:view",
          "deployment:data:write",
          "deployment:backups:view",
          "deployment:backups:create",
          "deployment:backups:download",
          "deployment:backups:delete",
          "deployment:backups:import",
          "deployment:functions:actAsUser",
          "deployment:functions:runInternalQueries",
          "deployment:functions:runInternalMutations",
          "deployment:functions:runInternalActions",
          "deployment:functions:runTestQuery",
          "deployment:auditLog:view",
          "deployment:usageLimits:view",
          "deployment:usageLimits:write",
          "deployment:usage:view",
          "deployment:aiGateway:use",
        ],
      },
    },
  },
};
const schema126 = { pattern: "^[0-9]+$", type: "string" };
const schema128 = {
  oneOf: [
    { type: "string", enum: ["vercel"] },
    { type: "object", required: ["oauthApp"], properties: { oauthApp: { type: "string" } } },
  ],
};
function validate56(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate56.evaluated;
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
    if (data.creationTime === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "creationTime" },
        message: "must have required property '" + "creationTime" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.allowedActions === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "allowedActions" },
        message: "must have required property '" + "allowedActions" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern0.test(data0)) {
          const err4 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/AccessTokenId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      } else {
        const err5 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/AccessTokenId/type",
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
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err6 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/properties/name/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.creationTime !== undefined) {
      let data2 = data.creationTime;
      if (!(typeof data2 == "number" && !(data2 % 1) && !isNaN(data2))) {
        const err7 = {
          instancePath: instancePath + "/creationTime",
          schemaPath: "#/properties/creationTime/type",
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
    }
    if (data.lastUsedTime !== undefined) {
      let data3 = data.lastUsedTime;
      if (!(typeof data3 == "number" && !(data3 % 1) && !isNaN(data3)) && data3 !== null) {
        const err8 = {
          instancePath: instancePath + "/lastUsedTime",
          schemaPath: "#/properties/lastUsedTime/type",
          keyword: "type",
          params: { type: schema125.properties.lastUsedTime.type },
          message: "must be integer,null",
        };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.expiresAt !== undefined) {
      let data4 = data.expiresAt;
      if (!(typeof data4 == "number" && !(data4 % 1) && !isNaN(data4)) && data4 !== null) {
        const err9 = {
          instancePath: instancePath + "/expiresAt",
          schemaPath: "#/properties/expiresAt/type",
          keyword: "type",
          params: { type: schema125.properties.expiresAt.type },
          message: "must be integer,null",
        };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.creator !== undefined) {
      let data5 = data.creator;
      const _errs13 = errors;
      let valid2 = false;
      let passing0 = null;
      const _errs14 = errors;
      if (data5 !== null) {
        const err10 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/properties/creator/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
      var _valid0 = _errs14 === errors;
      if (_valid0) {
        valid2 = true;
        passing0 = 0;
      }
      const _errs16 = errors;
      if (typeof data5 === "string") {
        if (!pattern0.test(data5)) {
          const err11 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      } else {
        const err12 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
      var _valid0 = _errs16 === errors;
      if (_valid0 && valid2) {
        valid2 = false;
        passing0 = [passing0, 1];
      } else {
        if (_valid0) {
          valid2 = true;
          passing0 = 1;
        }
      }
      if (!valid2) {
        const err13 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/properties/creator/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing0 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      } else {
        errors = _errs13;
        if (vErrors !== null) {
          if (_errs13) {
            vErrors.length = _errs13;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.managedBy !== undefined) {
      let data6 = data.managedBy;
      const _errs20 = errors;
      let valid4 = false;
      let passing1 = null;
      const _errs21 = errors;
      if (data6 !== null) {
        const err14 = {
          instancePath: instancePath + "/managedBy",
          schemaPath: "#/properties/managedBy/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
      var _valid1 = _errs21 === errors;
      if (_valid1) {
        valid4 = true;
        passing1 = 0;
      }
      const _errs23 = errors;
      const _errs25 = errors;
      let valid6 = false;
      let passing2 = null;
      const _errs26 = errors;
      if (typeof data6 !== "string") {
        const err15 = {
          instancePath: instancePath + "/managedBy",
          schemaPath: "#/components/schemas/ManagedBy/oneOf/0/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
      if (!(data6 === "vercel")) {
        const err16 = {
          instancePath: instancePath + "/managedBy",
          schemaPath: "#/components/schemas/ManagedBy/oneOf/0/enum",
          keyword: "enum",
          params: { allowedValues: schema128.oneOf[0].enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
      var _valid2 = _errs26 === errors;
      if (_valid2) {
        valid6 = true;
        passing2 = 0;
      }
      const _errs28 = errors;
      if (data6 && typeof data6 == "object" && !Array.isArray(data6)) {
        if (data6.oauthApp === undefined) {
          const err17 = {
            instancePath: instancePath + "/managedBy",
            schemaPath: "#/components/schemas/ManagedBy/oneOf/1/required",
            keyword: "required",
            params: { missingProperty: "oauthApp" },
            message: "must have required property '" + "oauthApp" + "'",
          };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
        if (data6.oauthApp !== undefined) {
          if (typeof data6.oauthApp !== "string") {
            const err18 = {
              instancePath: instancePath + "/managedBy/oauthApp",
              schemaPath: "#/components/schemas/ManagedBy/oneOf/1/properties/oauthApp/type",
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
        }
      } else {
        const err19 = {
          instancePath: instancePath + "/managedBy",
          schemaPath: "#/components/schemas/ManagedBy/oneOf/1/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
      var _valid2 = _errs28 === errors;
      if (_valid2 && valid6) {
        valid6 = false;
        passing2 = [passing2, 1];
      } else {
        if (_valid2) {
          valid6 = true;
          passing2 = 1;
          var props0 = {};
          props0.oauthApp = true;
        }
      }
      if (!valid6) {
        const err20 = {
          instancePath: instancePath + "/managedBy",
          schemaPath: "#/components/schemas/ManagedBy/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing2 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      } else {
        errors = _errs25;
        if (vErrors !== null) {
          if (_errs25) {
            vErrors.length = _errs25;
          } else {
            vErrors = null;
          }
        }
      }
      var _valid1 = _errs23 === errors;
      if (_valid1 && valid4) {
        valid4 = false;
        passing1 = [passing1, 1];
      } else {
        if (_valid1) {
          valid4 = true;
          passing1 = 1;
        }
      }
      if (!valid4) {
        const err21 = {
          instancePath: instancePath + "/managedBy",
          schemaPath: "#/properties/managedBy/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing1 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      } else {
        errors = _errs20;
        if (vErrors !== null) {
          if (_errs20) {
            vErrors.length = _errs20;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.allowedActions !== undefined) {
      let data8 = data.allowedActions;
      if (Array.isArray(data8)) {
        const len0 = data8.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data9 = data8[i0];
          if (typeof data9 !== "string") {
            const err22 = {
              instancePath: instancePath + "/allowedActions/" + i0,
              schemaPath: "#/properties/allowedActions/items/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
            };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
          if (
            !(
              data9 === "deployment:deploy" ||
              data9 === "deployment:env:view" ||
              data9 === "deployment:env:write" ||
              data9 === "deployment:pause" ||
              data9 === "deployment:unpause" ||
              data9 === "deployment:logs:view" ||
              data9 === "deployment:metrics:view" ||
              data9 === "deployment:integrations:view" ||
              data9 === "deployment:integrations:write" ||
              data9 === "deployment:data:view" ||
              data9 === "deployment:data:write" ||
              data9 === "deployment:backups:view" ||
              data9 === "deployment:backups:create" ||
              data9 === "deployment:backups:download" ||
              data9 === "deployment:backups:delete" ||
              data9 === "deployment:backups:import" ||
              data9 === "deployment:functions:actAsUser" ||
              data9 === "deployment:functions:runInternalQueries" ||
              data9 === "deployment:functions:runInternalMutations" ||
              data9 === "deployment:functions:runInternalActions" ||
              data9 === "deployment:functions:runTestQuery" ||
              data9 === "deployment:auditLog:view" ||
              data9 === "deployment:usageLimits:view" ||
              data9 === "deployment:usageLimits:write" ||
              data9 === "deployment:usage:view" ||
              data9 === "deployment:aiGateway:use"
            )
          ) {
            const err23 = {
              instancePath: instancePath + "/allowedActions/" + i0,
              schemaPath: "#/properties/allowedActions/items/enum",
              keyword: "enum",
              params: { allowedValues: schema125.properties.allowedActions.items.enum },
              message: "must be equal to one of the allowed values",
            };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
        }
      } else {
        const err24 = {
          instancePath: instancePath + "/allowedActions",
          schemaPath: "#/properties/allowedActions/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
    }
  } else {
    const err25 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err25];
    } else {
      vErrors.push(err25);
    }
    errors++;
  }
  validate56.errors = vErrors;
  return errors === 0;
}
validate56.evaluated = {
  props: {
    id: true,
    name: true,
    creationTime: true,
    lastUsedTime: true,
    expiresAt: true,
    creator: true,
    managedBy: true,
    allowedActions: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
function validate55(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate55.evaluated;
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
        !validate56(data[i0], {
          instancePath: instancePath + "/" + i0,
          parentData: data,
          parentDataProperty: i0,
          rootData,
          dynamicAnchors,
        })
      ) {
        vErrors = vErrors === null ? validate56.errors : vErrors.concat(validate56.errors);
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
  validate55.errors = vErrors;
  return errors === 0;
}
validate55.evaluated = { items: true, dynamicProps: false, dynamicItems: false };
function validate54(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate54.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate55(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate55.errors : vErrors.concat(validate55.errors);
    errors = vErrors.length;
  }
  validate54.errors = vErrors;
  return errors === 0;
}
validate54.evaluated = { items: true, dynamicProps: false, dynamicItems: false };
export const ajvCreatePreviewDeployKeyResponse = validate59;
const schema129 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1projects~1{project_id}~1create_preview_deploy_key/post/responses/200/content/application~1json/schema",
};
const schema130 = {
  type: "object",
  required: ["previewDeployKey"],
  properties: {
    previewDeployKey: {
      $ref: "#/components/schemas/AdminKey",
      description: "The generated preview deploy key.",
    },
  },
};
function validate60(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate60.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.previewDeployKey === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "previewDeployKey" },
        message: "must have required property '" + "previewDeployKey" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.previewDeployKey !== undefined) {
      if (typeof data.previewDeployKey !== "string") {
        const err1 = {
          instancePath: instancePath + "/previewDeployKey",
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
  validate60.errors = vErrors;
  return errors === 0;
}
validate60.evaluated = {
  props: { previewDeployKey: true },
  dynamicProps: false,
  dynamicItems: false,
};
function validate59(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate59.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate60(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate60.errors : vErrors.concat(validate60.errors);
    errors = vErrors.length;
  }
  validate59.errors = vErrors;
  return errors === 0;
}
validate59.evaluated = {
  props: { previewDeployKey: true },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvListPreviewDeployKeysResponse = validate62;
const schema132 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1projects~1{project_id}~1list_preview_deploy_keys/get/responses/200/content/application~1json/schema",
};
const schema133 = {
  type: "object",
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: { $ref: "#/components/schemas/PlatformDeployKeyResponse" },
      description: "The list of preview deploy keys.",
    },
  },
};
function validate63(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate63.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.items === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "items" },
        message: "must have required property '" + "items" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.items !== undefined) {
      let data0 = data.items;
      if (Array.isArray(data0)) {
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate56(data0[i0], {
              instancePath: instancePath + "/items/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate56.errors : vErrors.concat(validate56.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err1 = {
          instancePath: instancePath + "/items",
          schemaPath: "#/properties/items/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
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
  validate63.errors = vErrors;
  return errors === 0;
}
validate63.evaluated = { props: { items: true }, dynamicProps: false, dynamicItems: false };
function validate62(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate62.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate63(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate63.errors : vErrors.concat(validate63.errors);
    errors = vErrors.length;
  }
  validate62.errors = vErrors;
  return errors === 0;
}
validate62.evaluated = { props: { items: true }, dynamicProps: false, dynamicItems: false };
export const ajvListPersonalAccessTokensResponse = validate66;
const schema134 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1list_personal_access_tokens/get/responses/200/content/application~1json/schema",
};
const schema135 = {
  type: "object",
  required: ["items", "pagination"],
  properties: {
    items: { type: "array", items: { $ref: "#/components/schemas/PersonalAccessTokenResponse" } },
    pagination: { $ref: "#/components/schemas/PaginationMetadata" },
  },
};
const schema136 = {
  type: "object",
  required: ["id", "name", "creationTime"],
  properties: {
    id: {
      $ref: "#/components/schemas/AccessTokenId",
      description: "Stable identifier for this access token.",
    },
    name: { $ref: "#/components/schemas/DeviceName" },
    creationTime: { type: "integer", format: "int64" },
    lastUsedTime: { type: ["integer", "null"], format: "int64" },
    expiresAt: { type: ["integer", "null"], format: "int64" },
    ssoTeamId: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/TeamId" }] },
  },
};
function validate68(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate68.evaluated;
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
    if (data.creationTime === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "creationTime" },
        message: "must have required property '" + "creationTime" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern0.test(data0)) {
          const err3 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/AccessTokenId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      } else {
        const err4 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/AccessTokenId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
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
    if (data.creationTime !== undefined) {
      let data2 = data.creationTime;
      if (!(typeof data2 == "number" && !(data2 % 1) && !isNaN(data2))) {
        const err6 = {
          instancePath: instancePath + "/creationTime",
          schemaPath: "#/properties/creationTime/type",
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
    if (data.lastUsedTime !== undefined) {
      let data3 = data.lastUsedTime;
      if (!(typeof data3 == "number" && !(data3 % 1) && !isNaN(data3)) && data3 !== null) {
        const err7 = {
          instancePath: instancePath + "/lastUsedTime",
          schemaPath: "#/properties/lastUsedTime/type",
          keyword: "type",
          params: { type: schema136.properties.lastUsedTime.type },
          message: "must be integer,null",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.expiresAt !== undefined) {
      let data4 = data.expiresAt;
      if (!(typeof data4 == "number" && !(data4 % 1) && !isNaN(data4)) && data4 !== null) {
        const err8 = {
          instancePath: instancePath + "/expiresAt",
          schemaPath: "#/properties/expiresAt/type",
          keyword: "type",
          params: { type: schema136.properties.expiresAt.type },
          message: "must be integer,null",
        };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.ssoTeamId !== undefined) {
      let data5 = data.ssoTeamId;
      const _errs14 = errors;
      let valid3 = false;
      let passing0 = null;
      const _errs15 = errors;
      if (data5 !== null) {
        const err9 = {
          instancePath: instancePath + "/ssoTeamId",
          schemaPath: "#/properties/ssoTeamId/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
      var _valid0 = _errs15 === errors;
      if (_valid0) {
        valid3 = true;
        passing0 = 0;
      }
      const _errs17 = errors;
      if (typeof data5 === "string") {
        if (!pattern0.test(data5)) {
          const err10 = {
            instancePath: instancePath + "/ssoTeamId",
            schemaPath: "#/components/schemas/TeamId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      } else {
        const err11 = {
          instancePath: instancePath + "/ssoTeamId",
          schemaPath: "#/components/schemas/TeamId/type",
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
      var _valid0 = _errs17 === errors;
      if (_valid0 && valid3) {
        valid3 = false;
        passing0 = [passing0, 1];
      } else {
        if (_valid0) {
          valid3 = true;
          passing0 = 1;
        }
      }
      if (!valid3) {
        const err12 = {
          instancePath: instancePath + "/ssoTeamId",
          schemaPath: "#/properties/ssoTeamId/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing0 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      } else {
        errors = _errs14;
        if (vErrors !== null) {
          if (_errs14) {
            vErrors.length = _errs14;
          } else {
            vErrors = null;
          }
        }
      }
    }
  } else {
    const err13 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err13];
    } else {
      vErrors.push(err13);
    }
    errors++;
  }
  validate68.errors = vErrors;
  return errors === 0;
}
validate68.evaluated = {
  props: {
    id: true,
    name: true,
    creationTime: true,
    lastUsedTime: true,
    expiresAt: true,
    ssoTeamId: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
function validate67(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate67.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.items === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "items" },
        message: "must have required property '" + "items" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.pagination === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "pagination" },
        message: "must have required property '" + "pagination" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.items !== undefined) {
      let data0 = data.items;
      if (Array.isArray(data0)) {
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate68(data0[i0], {
              instancePath: instancePath + "/items/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate68.errors : vErrors.concat(validate68.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err2 = {
          instancePath: instancePath + "/items",
          schemaPath: "#/properties/items/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.pagination !== undefined) {
      let data2 = data.pagination;
      if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
        if (data2.hasMore === undefined) {
          const err3 = {
            instancePath: instancePath + "/pagination",
            schemaPath: "#/components/schemas/PaginationMetadata/required",
            keyword: "required",
            params: { missingProperty: "hasMore" },
            message: "must have required property '" + "hasMore" + "'",
          };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data2.hasMore !== undefined) {
          if (typeof data2.hasMore !== "boolean") {
            const err4 = {
              instancePath: instancePath + "/pagination/hasMore",
              schemaPath: "#/components/schemas/PaginationMetadata/properties/hasMore/type",
              keyword: "type",
              params: { type: "boolean" },
              message: "must be boolean",
            };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data2.nextCursor !== undefined) {
          let data4 = data2.nextCursor;
          if (typeof data4 !== "string" && data4 !== null) {
            const err5 = {
              instancePath: instancePath + "/pagination/nextCursor",
              schemaPath: "#/components/schemas/PaginationMetadata/properties/nextCursor/type",
              keyword: "type",
              params: { type: schema21.properties.nextCursor.type },
              message: "must be string,null",
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
      } else {
        const err6 = {
          instancePath: instancePath + "/pagination",
          schemaPath: "#/components/schemas/PaginationMetadata/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
  } else {
    const err7 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err7];
    } else {
      vErrors.push(err7);
    }
    errors++;
  }
  validate67.errors = vErrors;
  return errors === 0;
}
validate67.evaluated = {
  props: { items: true, pagination: true },
  dynamicProps: false,
  dynamicItems: false,
};
function validate66(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate66.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate67(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate67.errors : vErrors.concat(validate67.errors);
    errors = vErrors.length;
  }
  validate66.errors = vErrors;
  return errors === 0;
}
validate66.evaluated = {
  props: { items: true, pagination: true },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvCreatePersonalAccessTokenResponse = validate71;
const schema141 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1create_personal_access_token/post/responses/200/content/application~1json/schema",
};
const schema142 = {
  type: "object",
  required: ["accessToken"],
  properties: {
    accessToken: { type: "string", description: "The generated personal access token." },
  },
};
function validate71(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate71.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.accessToken === undefined) {
      const err0 = {
        instancePath,
        schemaPath:
          "https://api.convex.dev/v1/openapi.json#/paths/~1create_personal_access_token/post/responses/200/content/application~1json/schema/required",
        keyword: "required",
        params: { missingProperty: "accessToken" },
        message: "must have required property '" + "accessToken" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.accessToken !== undefined) {
      if (typeof data.accessToken !== "string") {
        const err1 = {
          instancePath: instancePath + "/accessToken",
          schemaPath:
            "https://api.convex.dev/v1/openapi.json#/paths/~1create_personal_access_token/post/responses/200/content/application~1json/schema/properties/accessToken/type",
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
      schemaPath:
        "https://api.convex.dev/v1/openapi.json#/paths/~1create_personal_access_token/post/responses/200/content/application~1json/schema/type",
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
  validate71.errors = vErrors;
  return errors === 0;
}
validate71.evaluated = { props: { accessToken: true }, dynamicProps: false, dynamicItems: false };
export const ajvListTeamAccessTokensResponse = validate72;
const schema143 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1list_access_tokens/get/responses/200/content/application~1json/schema",
};
const schema144 = {
  type: "object",
  required: ["items", "pagination"],
  properties: {
    items: {
      type: "array",
      items: { $ref: "#/components/schemas/TeamAccessTokenResponse" },
      description: "The team access tokens created by the authenticated member.",
    },
    pagination: { $ref: "#/components/schemas/PaginationMetadata" },
  },
};
const schema145 = {
  type: "object",
  required: ["id", "name", "creationTime"],
  properties: {
    id: { $ref: "#/components/schemas/AccessTokenId", description: "The id of this access token." },
    name: { type: "string", description: "Name of the token." },
    creationTime: {
      type: "integer",
      format: "int64",
      description: "Timestamp in milliseconds when the token was created.",
    },
    lastUsedTime: {
      type: ["integer", "null"],
      format: "int64",
      description: "Timestamp in milliseconds when the token was last used, if ever.",
    },
    expiresAt: {
      type: ["integer", "null"],
      format: "int64",
      description: "Timestamp in milliseconds when the token expires, if set.",
    },
    creator: {
      oneOf: [
        { type: "null" },
        { $ref: "#/components/schemas/MemberId", description: "The member who created the token." },
      ],
    },
  },
};
function validate74(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate74.evaluated;
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
    if (data.creationTime === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "creationTime" },
        message: "must have required property '" + "creationTime" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern0.test(data0)) {
          const err3 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/AccessTokenId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      } else {
        const err4 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/AccessTokenId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
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
          schemaPath: "#/properties/name/type",
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
    if (data.creationTime !== undefined) {
      let data2 = data.creationTime;
      if (!(typeof data2 == "number" && !(data2 % 1) && !isNaN(data2))) {
        const err6 = {
          instancePath: instancePath + "/creationTime",
          schemaPath: "#/properties/creationTime/type",
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
    if (data.lastUsedTime !== undefined) {
      let data3 = data.lastUsedTime;
      if (!(typeof data3 == "number" && !(data3 % 1) && !isNaN(data3)) && data3 !== null) {
        const err7 = {
          instancePath: instancePath + "/lastUsedTime",
          schemaPath: "#/properties/lastUsedTime/type",
          keyword: "type",
          params: { type: schema145.properties.lastUsedTime.type },
          message: "must be integer,null",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.expiresAt !== undefined) {
      let data4 = data.expiresAt;
      if (!(typeof data4 == "number" && !(data4 % 1) && !isNaN(data4)) && data4 !== null) {
        const err8 = {
          instancePath: instancePath + "/expiresAt",
          schemaPath: "#/properties/expiresAt/type",
          keyword: "type",
          params: { type: schema145.properties.expiresAt.type },
          message: "must be integer,null",
        };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.creator !== undefined) {
      let data5 = data.creator;
      const _errs13 = errors;
      let valid2 = false;
      let passing0 = null;
      const _errs14 = errors;
      if (data5 !== null) {
        const err9 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/properties/creator/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
      var _valid0 = _errs14 === errors;
      if (_valid0) {
        valid2 = true;
        passing0 = 0;
      }
      const _errs16 = errors;
      if (typeof data5 === "string") {
        if (!pattern0.test(data5)) {
          const err10 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      } else {
        const err11 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
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
      var _valid0 = _errs16 === errors;
      if (_valid0 && valid2) {
        valid2 = false;
        passing0 = [passing0, 1];
      } else {
        if (_valid0) {
          valid2 = true;
          passing0 = 1;
        }
      }
      if (!valid2) {
        const err12 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/properties/creator/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing0 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      } else {
        errors = _errs13;
        if (vErrors !== null) {
          if (_errs13) {
            vErrors.length = _errs13;
          } else {
            vErrors = null;
          }
        }
      }
    }
  } else {
    const err13 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err13];
    } else {
      vErrors.push(err13);
    }
    errors++;
  }
  validate74.errors = vErrors;
  return errors === 0;
}
validate74.evaluated = {
  props: {
    id: true,
    name: true,
    creationTime: true,
    lastUsedTime: true,
    expiresAt: true,
    creator: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
function validate73(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate73.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.items === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "items" },
        message: "must have required property '" + "items" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.pagination === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "pagination" },
        message: "must have required property '" + "pagination" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.items !== undefined) {
      let data0 = data.items;
      if (Array.isArray(data0)) {
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate74(data0[i0], {
              instancePath: instancePath + "/items/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate74.errors : vErrors.concat(validate74.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err2 = {
          instancePath: instancePath + "/items",
          schemaPath: "#/properties/items/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.pagination !== undefined) {
      let data2 = data.pagination;
      if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
        if (data2.hasMore === undefined) {
          const err3 = {
            instancePath: instancePath + "/pagination",
            schemaPath: "#/components/schemas/PaginationMetadata/required",
            keyword: "required",
            params: { missingProperty: "hasMore" },
            message: "must have required property '" + "hasMore" + "'",
          };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data2.hasMore !== undefined) {
          if (typeof data2.hasMore !== "boolean") {
            const err4 = {
              instancePath: instancePath + "/pagination/hasMore",
              schemaPath: "#/components/schemas/PaginationMetadata/properties/hasMore/type",
              keyword: "type",
              params: { type: "boolean" },
              message: "must be boolean",
            };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data2.nextCursor !== undefined) {
          let data4 = data2.nextCursor;
          if (typeof data4 !== "string" && data4 !== null) {
            const err5 = {
              instancePath: instancePath + "/pagination/nextCursor",
              schemaPath: "#/components/schemas/PaginationMetadata/properties/nextCursor/type",
              keyword: "type",
              params: { type: schema21.properties.nextCursor.type },
              message: "must be string,null",
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
      } else {
        const err6 = {
          instancePath: instancePath + "/pagination",
          schemaPath: "#/components/schemas/PaginationMetadata/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
  } else {
    const err7 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err7];
    } else {
      vErrors.push(err7);
    }
    errors++;
  }
  validate73.errors = vErrors;
  return errors === 0;
}
validate73.evaluated = {
  props: { items: true, pagination: true },
  dynamicProps: false,
  dynamicItems: false,
};
function validate72(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate72.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate73(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate73.errors : vErrors.concat(validate73.errors);
    errors = vErrors.length;
  }
  validate72.errors = vErrors;
  return errors === 0;
}
validate72.evaluated = {
  props: { items: true, pagination: true },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvGetTokenDetailsResponse = validate77;
const schema149 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1token_details/get/responses/200/content/application~1json/schema",
};
const schema150 = {
  oneOf: [
    {
      type: "object",
      required: ["id", "teamId", "name", "createTime", "type"],
      properties: {
        id: {
          $ref: "#/components/schemas/AccessTokenId",
          description: "Stable identifier for this access token.",
        },
        teamId: {
          $ref: "#/components/schemas/TeamId",
          description: "The team ID this token is associated with.",
        },
        name: {
          $ref: "#/components/schemas/DeviceName",
          description: "The name given to the token at creation.",
        },
        createTime: {
          type: "integer",
          format: "int64",
          description: "Timestamp in milliseconds when this token was created.",
        },
        type: { type: "string", enum: ["teamToken"] },
      },
    },
    {
      type: "object",
      required: ["id", "projectId", "name", "createTime", "type"],
      properties: {
        id: {
          $ref: "#/components/schemas/AccessTokenId",
          description: "Stable identifier for this access token.",
        },
        projectId: {
          $ref: "#/components/schemas/ProjectId",
          description: "The project ID this token is associated with.",
        },
        name: {
          $ref: "#/components/schemas/DeviceName",
          description: "The name given to the token at creation.",
        },
        createTime: {
          type: "integer",
          format: "int64",
          description: "Timestamp in milliseconds when this token was created.",
        },
        type: { type: "string", enum: ["projectToken"] },
      },
    },
  ],
};
function validate78(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate78.evaluated;
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
    if (data.teamId === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "teamId" },
        message: "must have required property '" + "teamId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.name === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "name" },
        message: "must have required property '" + "name" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.createTime === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "createTime" },
        message: "must have required property '" + "createTime" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.type === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "type" },
        message: "must have required property '" + "type" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern0.test(data0)) {
          const err5 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/AccessTokenId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      } else {
        const err6 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/AccessTokenId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.teamId !== undefined) {
      let data1 = data.teamId;
      if (typeof data1 === "string") {
        if (!pattern0.test(data1)) {
          const err7 = {
            instancePath: instancePath + "/teamId",
            schemaPath: "#/components/schemas/TeamId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      } else {
        const err8 = {
          instancePath: instancePath + "/teamId",
          schemaPath: "#/components/schemas/TeamId/type",
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
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err9 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/components/schemas/DeviceName/type",
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
    if (data.createTime !== undefined) {
      let data3 = data.createTime;
      if (!(typeof data3 == "number" && !(data3 % 1) && !isNaN(data3))) {
        const err10 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/oneOf/0/properties/createTime/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.type !== undefined) {
      let data4 = data.type;
      if (typeof data4 !== "string") {
        const err11 = {
          instancePath: instancePath + "/type",
          schemaPath: "#/oneOf/0/properties/type/type",
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
      if (!(data4 === "teamToken")) {
        const err12 = {
          instancePath: instancePath + "/type",
          schemaPath: "#/oneOf/0/properties/type/enum",
          keyword: "enum",
          params: { allowedValues: schema150.oneOf[0].properties.type.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
  } else {
    const err13 = {
      instancePath,
      schemaPath: "#/oneOf/0/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err13];
    } else {
      vErrors.push(err13);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
    var props0 = {};
    props0.id = true;
    props0.teamId = true;
    props0.name = true;
    props0.createTime = true;
    props0.type = true;
  }
  const _errs16 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === undefined) {
      const err14 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "id" },
        message: "must have required property '" + "id" + "'",
      };
      if (vErrors === null) {
        vErrors = [err14];
      } else {
        vErrors.push(err14);
      }
      errors++;
    }
    if (data.projectId === undefined) {
      const err15 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "projectId" },
        message: "must have required property '" + "projectId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err15];
      } else {
        vErrors.push(err15);
      }
      errors++;
    }
    if (data.name === undefined) {
      const err16 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "name" },
        message: "must have required property '" + "name" + "'",
      };
      if (vErrors === null) {
        vErrors = [err16];
      } else {
        vErrors.push(err16);
      }
      errors++;
    }
    if (data.createTime === undefined) {
      const err17 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "createTime" },
        message: "must have required property '" + "createTime" + "'",
      };
      if (vErrors === null) {
        vErrors = [err17];
      } else {
        vErrors.push(err17);
      }
      errors++;
    }
    if (data.type === undefined) {
      const err18 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "type" },
        message: "must have required property '" + "type" + "'",
      };
      if (vErrors === null) {
        vErrors = [err18];
      } else {
        vErrors.push(err18);
      }
      errors++;
    }
    if (data.id !== undefined) {
      let data5 = data.id;
      if (typeof data5 === "string") {
        if (!pattern0.test(data5)) {
          const err19 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/AccessTokenId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
      } else {
        const err20 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/AccessTokenId/type",
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
    if (data.projectId !== undefined) {
      let data6 = data.projectId;
      if (typeof data6 === "string") {
        if (!pattern0.test(data6)) {
          const err21 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      } else {
        const err22 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err23 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/components/schemas/DeviceName/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      }
    }
    if (data.createTime !== undefined) {
      let data8 = data.createTime;
      if (!(typeof data8 == "number" && !(data8 % 1) && !isNaN(data8))) {
        const err24 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/oneOf/1/properties/createTime/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
    }
    if (data.type !== undefined) {
      let data9 = data.type;
      if (typeof data9 !== "string") {
        const err25 = {
          instancePath: instancePath + "/type",
          schemaPath: "#/oneOf/1/properties/type/type",
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
      if (!(data9 === "projectToken")) {
        const err26 = {
          instancePath: instancePath + "/type",
          schemaPath: "#/oneOf/1/properties/type/enum",
          keyword: "enum",
          params: { allowedValues: schema150.oneOf[1].properties.type.enum },
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
  } else {
    const err27 = {
      instancePath,
      schemaPath: "#/oneOf/1/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err27];
    } else {
      vErrors.push(err27);
    }
    errors++;
  }
  var _valid0 = _errs16 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
      if (props0 !== true) {
        props0 = props0 || {};
        props0.id = true;
        props0.projectId = true;
        props0.name = true;
        props0.createTime = true;
        props0.type = true;
      }
    }
  }
  if (!valid0) {
    const err28 = {
      instancePath,
      schemaPath: "#/oneOf",
      keyword: "oneOf",
      params: { passingSchemas: passing0 },
      message: "must match exactly one schema in oneOf",
    };
    if (vErrors === null) {
      vErrors = [err28];
    } else {
      vErrors.push(err28);
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
  validate78.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate78.evaluated = { dynamicProps: true, dynamicItems: false };
function validate77(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate77.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate78(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate78.errors : vErrors.concat(validate78.errors);
    errors = vErrors.length;
  } else {
    var props0 = validate78.evaluated.props;
  }
  validate77.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate77.evaluated = { dynamicProps: true, dynamicItems: false };
export const ajvListCustomDomainsResponse = validate80;
const schema157 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1deployments~1{deployment_name}~1custom_domains/get/responses/200/content/application~1json/schema",
};
const schema158 = {
  type: "object",
  required: ["domains"],
  properties: {
    domains: {
      type: "array",
      items: { $ref: "#/components/schemas/PlatformCustomDomainResponse" },
      description: "List of custom domains configured for this deployment.",
    },
  },
};
const schema159 = {
  type: "object",
  required: ["creationTime", "deploymentName", "requestDestination", "domain"],
  properties: {
    creationTime: {
      type: "integer",
      format: "int64",
      description: "Timestamp in milliseconds when this domain was created.",
    },
    deploymentName: {
      type: "string",
      description: "The deployment name this domain is configured for.",
    },
    requestDestination: {
      $ref: "#/components/schemas/RequestDestination",
      description: "The destination for this custom domain (convexCloud or convexSite).",
    },
    domain: { type: "string", description: "The custom domain name." },
    verificationTime: {
      type: ["integer", "null"],
      format: "int64",
      description:
        "Timestamp in milliseconds when this domain was verified, or null if not\nyet verified.",
    },
  },
};
const schema160 = { type: "string", enum: ["convexCloud", "convexSite"] };
function validate82(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate82.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.creationTime === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "creationTime" },
        message: "must have required property '" + "creationTime" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.deploymentName === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "deploymentName" },
        message: "must have required property '" + "deploymentName" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.requestDestination === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "requestDestination" },
        message: "must have required property '" + "requestDestination" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.domain === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "domain" },
        message: "must have required property '" + "domain" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.creationTime !== undefined) {
      let data0 = data.creationTime;
      if (!(typeof data0 == "number" && !(data0 % 1) && !isNaN(data0))) {
        const err4 = {
          instancePath: instancePath + "/creationTime",
          schemaPath: "#/properties/creationTime/type",
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
    if (data.deploymentName !== undefined) {
      if (typeof data.deploymentName !== "string") {
        const err5 = {
          instancePath: instancePath + "/deploymentName",
          schemaPath: "#/properties/deploymentName/type",
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
    if (data.requestDestination !== undefined) {
      let data2 = data.requestDestination;
      if (typeof data2 !== "string") {
        const err6 = {
          instancePath: instancePath + "/requestDestination",
          schemaPath: "#/components/schemas/RequestDestination/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
      if (!(data2 === "convexCloud" || data2 === "convexSite")) {
        const err7 = {
          instancePath: instancePath + "/requestDestination",
          schemaPath: "#/components/schemas/RequestDestination/enum",
          keyword: "enum",
          params: { allowedValues: schema160.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.domain !== undefined) {
      if (typeof data.domain !== "string") {
        const err8 = {
          instancePath: instancePath + "/domain",
          schemaPath: "#/properties/domain/type",
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
    }
    if (data.verificationTime !== undefined) {
      let data4 = data.verificationTime;
      if (!(typeof data4 == "number" && !(data4 % 1) && !isNaN(data4)) && data4 !== null) {
        const err9 = {
          instancePath: instancePath + "/verificationTime",
          schemaPath: "#/properties/verificationTime/type",
          keyword: "type",
          params: { type: schema159.properties.verificationTime.type },
          message: "must be integer,null",
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
  validate82.errors = vErrors;
  return errors === 0;
}
validate82.evaluated = {
  props: {
    creationTime: true,
    deploymentName: true,
    requestDestination: true,
    domain: true,
    verificationTime: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
function validate81(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate81.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.domains === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "domains" },
        message: "must have required property '" + "domains" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.domains !== undefined) {
      let data0 = data.domains;
      if (Array.isArray(data0)) {
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate82(data0[i0], {
              instancePath: instancePath + "/domains/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate82.errors : vErrors.concat(validate82.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err1 = {
          instancePath: instancePath + "/domains",
          schemaPath: "#/properties/domains/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
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
  validate81.errors = vErrors;
  return errors === 0;
}
validate81.evaluated = { props: { domains: true }, dynamicProps: false, dynamicItems: false };
function validate80(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate80.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate81(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate81.errors : vErrors.concat(validate81.errors);
    errors = vErrors.length;
  }
  validate80.errors = vErrors;
  return errors === 0;
}
validate80.evaluated = { props: { domains: true }, dynamicProps: false, dynamicItems: false };
export const ajvListTeamMembersResponse = validate85;
const schema161 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1list_members/get/responses/200/content/application~1json/schema",
};
const schema162 = {
  type: "object",
  required: ["items"],
  properties: { items: { type: "array", items: { $ref: "#/components/schemas/TeamMember" } } },
};
const schema163 = {
  type: "object",
  required: ["id", "email", "role"],
  properties: {
    id: { $ref: "#/components/schemas/MemberId" },
    name: { type: ["string", "null"], description: "The name of the team member" },
    email: { type: "string", description: "The email of the team member" },
    role: {
      $ref: "#/components/schemas/Role",
      description:
        "The role of the team member. `custom` indicates the member's\npermissions come from the attached `customRoles`.",
    },
    customRoles: {
      type: ["array", "null"],
      items: { $ref: "#/components/schemas/TeamMemberCustomRole" },
      description:
        "The custom roles attached to this team member. Present iff\n`role` is `custom`.",
    },
  },
};
const schema165 = { type: "string", enum: ["admin", "developer", "custom"] };
const schema166 = {
  type: "object",
  description:
    "A custom role attached to a team member, denormalized with the\nrole's display name so API consumers can render members without a\nseparate roles lookup.",
  required: ["id", "name"],
  properties: { id: { $ref: "#/components/schemas/CustomRoleId" }, name: { type: "string" } },
};
const schema167 = { pattern: "^[0-9]+$", type: "string" };
function validate88(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate88.evaluated;
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
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern0.test(data0)) {
          const err2 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/CustomRoleId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
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
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/CustomRoleId/type",
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
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err4 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/properties/name/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
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
  validate88.errors = vErrors;
  return errors === 0;
}
validate88.evaluated = {
  props: { id: true, name: true },
  dynamicProps: false,
  dynamicItems: false,
};
function validate87(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate87.evaluated;
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
    if (data.email === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "email" },
        message: "must have required property '" + "email" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.role === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "role" },
        message: "must have required property '" + "role" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern0.test(data0)) {
          const err3 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      } else {
        const err4 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/MemberId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
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
      let data1 = data.name;
      if (typeof data1 !== "string" && data1 !== null) {
        const err5 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/properties/name/type",
          keyword: "type",
          params: { type: schema163.properties.name.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.email !== undefined) {
      if (typeof data.email !== "string") {
        const err6 = {
          instancePath: instancePath + "/email",
          schemaPath: "#/properties/email/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.role !== undefined) {
      let data3 = data.role;
      if (typeof data3 !== "string") {
        const err7 = {
          instancePath: instancePath + "/role",
          schemaPath: "#/components/schemas/Role/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
      if (!(data3 === "admin" || data3 === "developer" || data3 === "custom")) {
        const err8 = {
          instancePath: instancePath + "/role",
          schemaPath: "#/components/schemas/Role/enum",
          keyword: "enum",
          params: { allowedValues: schema165.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.customRoles !== undefined) {
      let data4 = data.customRoles;
      if (!Array.isArray(data4) && data4 !== null) {
        const err9 = {
          instancePath: instancePath + "/customRoles",
          schemaPath: "#/properties/customRoles/type",
          keyword: "type",
          params: { type: schema163.properties.customRoles.type },
          message: "must be array,null",
        };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
      if (Array.isArray(data4)) {
        const len0 = data4.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate88(data4[i0], {
              instancePath: instancePath + "/customRoles/" + i0,
              parentData: data4,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate88.errors : vErrors.concat(validate88.errors);
            errors = vErrors.length;
          }
        }
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
  validate87.errors = vErrors;
  return errors === 0;
}
validate87.evaluated = {
  props: { id: true, name: true, email: true, role: true, customRoles: true },
  dynamicProps: false,
  dynamicItems: false,
};
function validate86(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate86.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.items === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "items" },
        message: "must have required property '" + "items" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.items !== undefined) {
      let data0 = data.items;
      if (Array.isArray(data0)) {
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate87(data0[i0], {
              instancePath: instancePath + "/items/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate87.errors : vErrors.concat(validate87.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err1 = {
          instancePath: instancePath + "/items",
          schemaPath: "#/properties/items/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
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
  validate86.errors = vErrors;
  return errors === 0;
}
validate86.evaluated = { props: { items: true }, dynamicProps: false, dynamicItems: false };
function validate85(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate85.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate86(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate86.errors : vErrors.concat(validate86.errors);
    errors = vErrors.length;
  }
  validate85.errors = vErrors;
  return errors === 0;
}
validate85.evaluated = { props: { items: true }, dynamicProps: false, dynamicItems: false };
export const ajvCreateTeamResponse = validate92;
const schema168 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1create_team/post/responses/201/content/application~1json/schema",
};
const schema169 = {
  type: "object",
  required: ["id", "name", "slug", "suspended", "referralCode"],
  properties: {
    id: { $ref: "#/components/schemas/TeamId" },
    name: { $ref: "#/components/schemas/TeamName" },
    slug: { $ref: "#/components/schemas/TeamSlug" },
    creator: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/MemberId" }] },
    suspended: { type: "boolean" },
    referralCode: { $ref: "#/components/schemas/ReferralCode" },
    referredBy: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/TeamId" }] },
    managedBy: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/ManagedBy" }] },
    defaultRegion: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/RegionName" }] },
    ssoLoginId: { type: ["string", "null"] },
    managedByUrl: { type: ["string", "null"] },
  },
};
const schema171 = { type: "string" };
const schema174 = { type: "string" };
function validate93(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate93.evaluated;
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
    if (data.suspended === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "suspended" },
        message: "must have required property '" + "suspended" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.referralCode === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "referralCode" },
        message: "must have required property '" + "referralCode" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern0.test(data0)) {
          const err5 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/TeamId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      } else {
        const err6 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/TeamId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err7 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/components/schemas/TeamName/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.slug !== undefined) {
      if (typeof data.slug !== "string") {
        const err8 = {
          instancePath: instancePath + "/slug",
          schemaPath: "#/components/schemas/TeamSlug/type",
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
    }
    if (data.creator !== undefined) {
      let data3 = data.creator;
      const _errs11 = errors;
      let valid4 = false;
      let passing0 = null;
      const _errs12 = errors;
      if (data3 !== null) {
        const err9 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/properties/creator/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
      var _valid0 = _errs12 === errors;
      if (_valid0) {
        valid4 = true;
        passing0 = 0;
      }
      const _errs14 = errors;
      if (typeof data3 === "string") {
        if (!pattern0.test(data3)) {
          const err10 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      } else {
        const err11 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
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
      var _valid0 = _errs14 === errors;
      if (_valid0 && valid4) {
        valid4 = false;
        passing0 = [passing0, 1];
      } else {
        if (_valid0) {
          valid4 = true;
          passing0 = 1;
        }
      }
      if (!valid4) {
        const err12 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/properties/creator/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing0 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      } else {
        errors = _errs11;
        if (vErrors !== null) {
          if (_errs11) {
            vErrors.length = _errs11;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.suspended !== undefined) {
      if (typeof data.suspended !== "boolean") {
        const err13 = {
          instancePath: instancePath + "/suspended",
          schemaPath: "#/properties/suspended/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
        };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.referralCode !== undefined) {
      if (typeof data.referralCode !== "string") {
        const err14 = {
          instancePath: instancePath + "/referralCode",
          schemaPath: "#/components/schemas/ReferralCode/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.referredBy !== undefined) {
      let data6 = data.referredBy;
      const _errs23 = errors;
      let valid7 = false;
      let passing1 = null;
      const _errs24 = errors;
      if (data6 !== null) {
        const err15 = {
          instancePath: instancePath + "/referredBy",
          schemaPath: "#/properties/referredBy/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
      var _valid1 = _errs24 === errors;
      if (_valid1) {
        valid7 = true;
        passing1 = 0;
      }
      const _errs26 = errors;
      if (typeof data6 === "string") {
        if (!pattern0.test(data6)) {
          const err16 = {
            instancePath: instancePath + "/referredBy",
            schemaPath: "#/components/schemas/TeamId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
      } else {
        const err17 = {
          instancePath: instancePath + "/referredBy",
          schemaPath: "#/components/schemas/TeamId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
      var _valid1 = _errs26 === errors;
      if (_valid1 && valid7) {
        valid7 = false;
        passing1 = [passing1, 1];
      } else {
        if (_valid1) {
          valid7 = true;
          passing1 = 1;
        }
      }
      if (!valid7) {
        const err18 = {
          instancePath: instancePath + "/referredBy",
          schemaPath: "#/properties/referredBy/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing1 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      } else {
        errors = _errs23;
        if (vErrors !== null) {
          if (_errs23) {
            vErrors.length = _errs23;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.managedBy !== undefined) {
      let data7 = data.managedBy;
      const _errs30 = errors;
      let valid9 = false;
      let passing2 = null;
      const _errs31 = errors;
      if (data7 !== null) {
        const err19 = {
          instancePath: instancePath + "/managedBy",
          schemaPath: "#/properties/managedBy/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
      var _valid2 = _errs31 === errors;
      if (_valid2) {
        valid9 = true;
        passing2 = 0;
      }
      const _errs33 = errors;
      const _errs35 = errors;
      let valid11 = false;
      let passing3 = null;
      const _errs36 = errors;
      if (typeof data7 !== "string") {
        const err20 = {
          instancePath: instancePath + "/managedBy",
          schemaPath: "#/components/schemas/ManagedBy/oneOf/0/type",
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
      if (!(data7 === "vercel")) {
        const err21 = {
          instancePath: instancePath + "/managedBy",
          schemaPath: "#/components/schemas/ManagedBy/oneOf/0/enum",
          keyword: "enum",
          params: { allowedValues: schema128.oneOf[0].enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
      var _valid3 = _errs36 === errors;
      if (_valid3) {
        valid11 = true;
        passing3 = 0;
      }
      const _errs38 = errors;
      if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
        if (data7.oauthApp === undefined) {
          const err22 = {
            instancePath: instancePath + "/managedBy",
            schemaPath: "#/components/schemas/ManagedBy/oneOf/1/required",
            keyword: "required",
            params: { missingProperty: "oauthApp" },
            message: "must have required property '" + "oauthApp" + "'",
          };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
        if (data7.oauthApp !== undefined) {
          if (typeof data7.oauthApp !== "string") {
            const err23 = {
              instancePath: instancePath + "/managedBy/oauthApp",
              schemaPath: "#/components/schemas/ManagedBy/oneOf/1/properties/oauthApp/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
            };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
        }
      } else {
        const err24 = {
          instancePath: instancePath + "/managedBy",
          schemaPath: "#/components/schemas/ManagedBy/oneOf/1/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
      var _valid3 = _errs38 === errors;
      if (_valid3 && valid11) {
        valid11 = false;
        passing3 = [passing3, 1];
      } else {
        if (_valid3) {
          valid11 = true;
          passing3 = 1;
          var props0 = {};
          props0.oauthApp = true;
        }
      }
      if (!valid11) {
        const err25 = {
          instancePath: instancePath + "/managedBy",
          schemaPath: "#/components/schemas/ManagedBy/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing3 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      } else {
        errors = _errs35;
        if (vErrors !== null) {
          if (_errs35) {
            vErrors.length = _errs35;
          } else {
            vErrors = null;
          }
        }
      }
      var _valid2 = _errs33 === errors;
      if (_valid2 && valid9) {
        valid9 = false;
        passing2 = [passing2, 1];
      } else {
        if (_valid2) {
          valid9 = true;
          passing2 = 1;
        }
      }
      if (!valid9) {
        const err26 = {
          instancePath: instancePath + "/managedBy",
          schemaPath: "#/properties/managedBy/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing2 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
        }
        errors++;
      } else {
        errors = _errs30;
        if (vErrors !== null) {
          if (_errs30) {
            vErrors.length = _errs30;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.defaultRegion !== undefined) {
      let data9 = data.defaultRegion;
      const _errs43 = errors;
      let valid13 = false;
      let passing4 = null;
      const _errs44 = errors;
      if (data9 !== null) {
        const err27 = {
          instancePath: instancePath + "/defaultRegion",
          schemaPath: "#/properties/defaultRegion/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
      var _valid4 = _errs44 === errors;
      if (_valid4) {
        valid13 = true;
        passing4 = 0;
      }
      const _errs46 = errors;
      if (typeof data9 !== "string") {
        const err28 = {
          instancePath: instancePath + "/defaultRegion",
          schemaPath: "#/components/schemas/RegionName/type",
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
      if (
        !(
          data9 === "aws-us-east-1" ||
          data9 === "aws-eu-west-1" ||
          data9 === "aws-ca-central-1" ||
          data9 === "aws-ap-southeast-2"
        )
      ) {
        const err29 = {
          instancePath: instancePath + "/defaultRegion",
          schemaPath: "#/components/schemas/RegionName/enum",
          keyword: "enum",
          params: { allowedValues: schema30.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err29];
        } else {
          vErrors.push(err29);
        }
        errors++;
      }
      var _valid4 = _errs46 === errors;
      if (_valid4 && valid13) {
        valid13 = false;
        passing4 = [passing4, 1];
      } else {
        if (_valid4) {
          valid13 = true;
          passing4 = 1;
        }
      }
      if (!valid13) {
        const err30 = {
          instancePath: instancePath + "/defaultRegion",
          schemaPath: "#/properties/defaultRegion/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing4 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err30];
        } else {
          vErrors.push(err30);
        }
        errors++;
      } else {
        errors = _errs43;
        if (vErrors !== null) {
          if (_errs43) {
            vErrors.length = _errs43;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.ssoLoginId !== undefined) {
      let data10 = data.ssoLoginId;
      if (typeof data10 !== "string" && data10 !== null) {
        const err31 = {
          instancePath: instancePath + "/ssoLoginId",
          schemaPath: "#/properties/ssoLoginId/type",
          keyword: "type",
          params: { type: schema169.properties.ssoLoginId.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      }
    }
    if (data.managedByUrl !== undefined) {
      let data11 = data.managedByUrl;
      if (typeof data11 !== "string" && data11 !== null) {
        const err32 = {
          instancePath: instancePath + "/managedByUrl",
          schemaPath: "#/properties/managedByUrl/type",
          keyword: "type",
          params: { type: schema169.properties.managedByUrl.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err32];
        } else {
          vErrors.push(err32);
        }
        errors++;
      }
    }
  } else {
    const err33 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err33];
    } else {
      vErrors.push(err33);
    }
    errors++;
  }
  validate93.errors = vErrors;
  return errors === 0;
}
validate93.evaluated = {
  props: {
    id: true,
    name: true,
    slug: true,
    creator: true,
    suspended: true,
    referralCode: true,
    referredBy: true,
    managedBy: true,
    defaultRegion: true,
    ssoLoginId: true,
    managedByUrl: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
function validate92(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate92.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate93(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate93.errors : vErrors.concat(validate93.errors);
    errors = vErrors.length;
  }
  validate92.errors = vErrors;
  return errors === 0;
}
validate92.evaluated = {
  props: {
    id: true,
    name: true,
    slug: true,
    creator: true,
    suspended: true,
    referralCode: true,
    referredBy: true,
    managedBy: true,
    defaultRegion: true,
    ssoLoginId: true,
    managedByUrl: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvCreateTeamAccessTokenResponse = validate95;
const schema178 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1create_access_token/post/responses/201/content/application~1json/schema",
};
const schema179 = {
  type: "object",
  required: ["accessToken", "tokenType"],
  properties: { accessToken: { type: "string" }, tokenType: { type: "string" } },
};
function validate95(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate95.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.accessToken === undefined) {
      const err0 = {
        instancePath,
        schemaPath:
          "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1create_access_token/post/responses/201/content/application~1json/schema/required",
        keyword: "required",
        params: { missingProperty: "accessToken" },
        message: "must have required property '" + "accessToken" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.tokenType === undefined) {
      const err1 = {
        instancePath,
        schemaPath:
          "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1create_access_token/post/responses/201/content/application~1json/schema/required",
        keyword: "required",
        params: { missingProperty: "tokenType" },
        message: "must have required property '" + "tokenType" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.accessToken !== undefined) {
      if (typeof data.accessToken !== "string") {
        const err2 = {
          instancePath: instancePath + "/accessToken",
          schemaPath:
            "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1create_access_token/post/responses/201/content/application~1json/schema/properties/accessToken/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.tokenType !== undefined) {
      if (typeof data.tokenType !== "string") {
        const err3 = {
          instancePath: instancePath + "/tokenType",
          schemaPath:
            "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1create_access_token/post/responses/201/content/application~1json/schema/properties/tokenType/type",
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
  } else {
    const err4 = {
      instancePath,
      schemaPath:
        "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1create_access_token/post/responses/201/content/application~1json/schema/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err4];
    } else {
      vErrors.push(err4);
    }
    errors++;
  }
  validate95.errors = vErrors;
  return errors === 0;
}
validate95.evaluated = {
  props: { accessToken: true, tokenType: true },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvListAuditLogEventsResponse = validate96;
const schema180 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1list_audit_log_events/get/responses/200/content/application~1json/schema",
};
const schema181 = {
  type: "object",
  required: ["items", "pagination"],
  properties: {
    items: { type: "array", items: { $ref: "#/components/schemas/AuditLogEventResponse" } },
    pagination: { $ref: "#/components/schemas/PaginationMetadata" },
  },
};
const schema182 = {
  type: "object",
  required: ["teamId", "actor", "action", "createTime", "metadata"],
  properties: {
    teamId: { $ref: "#/components/schemas/TeamId", description: "Team ID" },
    actor: {
      $ref: "#/components/schemas/AuditLogActor",
      description: "The identity that executed the action",
    },
    action: {
      type: "string",
      enum: [
        "team:join",
        "team:create",
        "team:update",
        "team:delete",
        "project:create",
        "project:transfer",
        "project:receive",
        "project:update",
        "project:delete",
        "defaultEnvironmentVariable:create",
        "defaultEnvironmentVariable:update",
        "defaultEnvironmentVariable:delete",
        "deployment:create",
        "deployment:delete",
        "member:invite",
        "member:cancelInvitation",
        "member:remove",
        "member:updateRole",
        "project:updateMemberRole",
        "billing:paymentMethod:update",
        "billing:contact:update",
        "billing:address:update",
        "billing:subscription:create",
        "billing:subscription:resume",
        "billing:subscription:cancel",
        "billing:subscription:changePlan",
        "team:token:create",
        "team:token:update",
        "team:token:delete",
        "team:token:view",
        "project:token:create",
        "project:token:update",
        "project:token:delete",
        "project:token:view",
        "deployment:token:create",
        "deployment:token:update",
        "deployment:token:delete",
        "deployment:token:view",
        "member:token:createWithSsoAccess",
        "team:domain:create",
        "team:domain:delete",
        "deployment:customDomain:create",
        "deployment:customDomain:delete",
        "deployment:backups:create",
        "deployment:backups:import",
        "deployment:backups:configurePeriodic",
        "deployment:backups:disablePeriodic",
        "deployment:backups:delete",
        "team:disableExceedingSpendingLimits",
        "billing:spendingLimit:update",
        "team:applyReferralCode",
        "oauthApplication:create",
        "oauthApplication:update",
        "oauthApplication:delete",
        "oauthApplication:verify",
        "oauthApplication:generateClientSecret",
        "integration:workos:team:create",
        "integration:workos:environment:create",
        "integration:workos:environment:delete",
        "integration:workos:environment:retrieveCredentials",
        "integration:workos:team:disconnect",
        "integration:workos:team:inviteMember",
        "integration:workos:projectEnvironment:create",
        "integration:workos:projectEnvironment:delete",
        "integration:workos:projectEnvironment:retrieveCredentials",
        "sso:enable",
        "sso:disable",
        "sso:update",
        "directorySync:enable",
        "directorySync:disable",
        "directorySync:updateGroupMapping",
        "directorySync:deleteGroupMapping",
        "deployment:transfer",
        "deployment:receive",
        "deployment:update",
        "customRole:create",
        "customRole:update",
        "customRole:delete",
      ],
    },
    createTime: {
      type: "integer",
      format: "int64",
      description: "Time the event was created, in milliseconds since epoch.",
    },
    metadata: {
      $ref: "#/components/schemas/Value",
      description: "Additional JSON metadata about the audit log event",
    },
    clientIp: {
      type: ["string", "null"],
      description: "IP address of the client that performed the action, if known.",
    },
    clientUserAgent: {
      type: ["string", "null"],
      description: "User agent of the client that performed the action, if known.",
    },
  },
};
const schema188 = {};
const schema184 = {
  oneOf: [
    {
      type: "object",
      title: "System",
      description: "The internal Convex system.",
      required: ["kind"],
      properties: { kind: { type: "string", enum: ["system"] } },
    },
    {
      type: "object",
      title: "Member",
      description: "A member acting via the dashboard.",
      required: ["member_id", "kind"],
      properties: {
        member_id: { $ref: "#/components/schemas/MemberId", description: "Member ID" },
        kind: { type: "string", enum: ["member"] },
      },
    },
    {
      type: "object",
      title: "Token",
      description: "A token.",
      required: ["token_id", "kind"],
      properties: {
        member_id: {
          oneOf: [
            { type: "null" },
            { $ref: "#/components/schemas/MemberId", description: "Member ID" },
          ],
        },
        token_id: {
          $ref: "#/components/schemas/AccessTokenId",
          description:
            "Token ID. `0` for legacy audit log rows created before token IDs\nwere recorded.",
        },
        client_id: {
          type: ["string", "null"],
          description:
            "Client ID of the OAuth application the token was issued to or is\nmanaged by, if any.",
        },
        kind: { type: "string", enum: ["token"] },
      },
    },
    {
      type: "object",
      title: "Integration",
      description: "An integration (OAuth application).",
      required: ["client_id", "kind"],
      properties: {
        client_id: { type: "string", description: "Client ID of the integration" },
        kind: { type: "string", enum: ["integration"] },
      },
    },
  ],
  description: "The identity that executed an audit log action.",
};
function validate99(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate99.evaluated;
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
    if (data.kind === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/oneOf/0/required",
        keyword: "required",
        params: { missingProperty: "kind" },
        message: "must have required property '" + "kind" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.kind !== undefined) {
      let data0 = data.kind;
      if (typeof data0 !== "string") {
        const err1 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/0/properties/kind/type",
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
      if (!(data0 === "system")) {
        const err2 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/0/properties/kind/enum",
          keyword: "enum",
          params: { allowedValues: schema184.oneOf[0].properties.kind.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
  } else {
    const err3 = {
      instancePath,
      schemaPath: "#/oneOf/0/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err3];
    } else {
      vErrors.push(err3);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
    var props0 = {};
    props0.kind = true;
  }
  const _errs5 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.member_id === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "member_id" },
        message: "must have required property '" + "member_id" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.kind === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/oneOf/1/required",
        keyword: "required",
        params: { missingProperty: "kind" },
        message: "must have required property '" + "kind" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.member_id !== undefined) {
      let data1 = data.member_id;
      if (typeof data1 === "string") {
        if (!pattern0.test(data1)) {
          const err6 = {
            instancePath: instancePath + "/member_id",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      } else {
        const err7 = {
          instancePath: instancePath + "/member_id",
          schemaPath: "#/components/schemas/MemberId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.kind !== undefined) {
      let data2 = data.kind;
      if (typeof data2 !== "string") {
        const err8 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/1/properties/kind/type",
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
      if (!(data2 === "member")) {
        const err9 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/1/properties/kind/enum",
          keyword: "enum",
          params: { allowedValues: schema184.oneOf[1].properties.kind.enum },
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
      schemaPath: "#/oneOf/1/type",
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
  var _valid0 = _errs5 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
      if (props0 !== true) {
        props0 = props0 || {};
        props0.member_id = true;
        props0.kind = true;
      }
    }
    const _errs12 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.token_id === undefined) {
        const err11 = {
          instancePath,
          schemaPath: "#/oneOf/2/required",
          keyword: "required",
          params: { missingProperty: "token_id" },
          message: "must have required property '" + "token_id" + "'",
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
      if (data.kind === undefined) {
        const err12 = {
          instancePath,
          schemaPath: "#/oneOf/2/required",
          keyword: "required",
          params: { missingProperty: "kind" },
          message: "must have required property '" + "kind" + "'",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
      if (data.member_id !== undefined) {
        let data3 = data.member_id;
        const _errs15 = errors;
        let valid5 = false;
        let passing1 = null;
        const _errs16 = errors;
        if (data3 !== null) {
          const err13 = {
            instancePath: instancePath + "/member_id",
            schemaPath: "#/oneOf/2/properties/member_id/oneOf/0/type",
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
        var _valid1 = _errs16 === errors;
        if (_valid1) {
          valid5 = true;
          passing1 = 0;
        }
        const _errs18 = errors;
        if (typeof data3 === "string") {
          if (!pattern0.test(data3)) {
            const err14 = {
              instancePath: instancePath + "/member_id",
              schemaPath: "#/components/schemas/MemberId/pattern",
              keyword: "pattern",
              params: { pattern: "^[0-9]+$" },
              message: 'must match pattern "' + "^[0-9]+$" + '"',
            };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        } else {
          const err15 = {
            instancePath: instancePath + "/member_id",
            schemaPath: "#/components/schemas/MemberId/type",
            keyword: "type",
            params: { type: "string" },
            message: "must be string",
          };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
        var _valid1 = _errs18 === errors;
        if (_valid1 && valid5) {
          valid5 = false;
          passing1 = [passing1, 1];
        } else {
          if (_valid1) {
            valid5 = true;
            passing1 = 1;
          }
        }
        if (!valid5) {
          const err16 = {
            instancePath: instancePath + "/member_id",
            schemaPath: "#/oneOf/2/properties/member_id/oneOf",
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
          errors = _errs15;
          if (vErrors !== null) {
            if (_errs15) {
              vErrors.length = _errs15;
            } else {
              vErrors = null;
            }
          }
        }
      }
      if (data.token_id !== undefined) {
        let data4 = data.token_id;
        if (typeof data4 === "string") {
          if (!pattern0.test(data4)) {
            const err17 = {
              instancePath: instancePath + "/token_id",
              schemaPath: "#/components/schemas/AccessTokenId/pattern",
              keyword: "pattern",
              params: { pattern: "^[0-9]+$" },
              message: 'must match pattern "' + "^[0-9]+$" + '"',
            };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        } else {
          const err18 = {
            instancePath: instancePath + "/token_id",
            schemaPath: "#/components/schemas/AccessTokenId/type",
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
      }
      if (data.client_id !== undefined) {
        let data5 = data.client_id;
        if (typeof data5 !== "string" && data5 !== null) {
          const err19 = {
            instancePath: instancePath + "/client_id",
            schemaPath: "#/oneOf/2/properties/client_id/type",
            keyword: "type",
            params: { type: schema184.oneOf[2].properties.client_id.type },
            message: "must be string,null",
          };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
      }
      if (data.kind !== undefined) {
        let data6 = data.kind;
        if (typeof data6 !== "string") {
          const err20 = {
            instancePath: instancePath + "/kind",
            schemaPath: "#/oneOf/2/properties/kind/type",
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
        if (!(data6 === "token")) {
          const err21 = {
            instancePath: instancePath + "/kind",
            schemaPath: "#/oneOf/2/properties/kind/enum",
            keyword: "enum",
            params: { allowedValues: schema184.oneOf[2].properties.kind.enum },
            message: "must be equal to one of the allowed values",
          };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      }
    } else {
      const err22 = {
        instancePath,
        schemaPath: "#/oneOf/2/type",
        keyword: "type",
        params: { type: "object" },
        message: "must be object",
      };
      if (vErrors === null) {
        vErrors = [err22];
      } else {
        vErrors.push(err22);
      }
      errors++;
    }
    var _valid0 = _errs12 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
        if (props0 !== true) {
          props0 = props0 || {};
          props0.member_id = true;
          props0.token_id = true;
          props0.client_id = true;
          props0.kind = true;
        }
      }
      const _errs28 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.client_id === undefined) {
          const err23 = {
            instancePath,
            schemaPath: "#/oneOf/3/required",
            keyword: "required",
            params: { missingProperty: "client_id" },
            message: "must have required property '" + "client_id" + "'",
          };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
        if (data.kind === undefined) {
          const err24 = {
            instancePath,
            schemaPath: "#/oneOf/3/required",
            keyword: "required",
            params: { missingProperty: "kind" },
            message: "must have required property '" + "kind" + "'",
          };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
        if (data.client_id !== undefined) {
          if (typeof data.client_id !== "string") {
            const err25 = {
              instancePath: instancePath + "/client_id",
              schemaPath: "#/oneOf/3/properties/client_id/type",
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
        }
        if (data.kind !== undefined) {
          let data8 = data.kind;
          if (typeof data8 !== "string") {
            const err26 = {
              instancePath: instancePath + "/kind",
              schemaPath: "#/oneOf/3/properties/kind/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
            };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
          if (!(data8 === "integration")) {
            const err27 = {
              instancePath: instancePath + "/kind",
              schemaPath: "#/oneOf/3/properties/kind/enum",
              keyword: "enum",
              params: { allowedValues: schema184.oneOf[3].properties.kind.enum },
              message: "must be equal to one of the allowed values",
            };
            if (vErrors === null) {
              vErrors = [err27];
            } else {
              vErrors.push(err27);
            }
            errors++;
          }
        }
      } else {
        const err28 = {
          instancePath,
          schemaPath: "#/oneOf/3/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err28];
        } else {
          vErrors.push(err28);
        }
        errors++;
      }
      var _valid0 = _errs28 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
          if (props0 !== true) {
            props0 = props0 || {};
            props0.client_id = true;
            props0.kind = true;
          }
        }
      }
    }
  }
  if (!valid0) {
    const err29 = {
      instancePath,
      schemaPath: "#/oneOf",
      keyword: "oneOf",
      params: { passingSchemas: passing0 },
      message: "must match exactly one schema in oneOf",
    };
    if (vErrors === null) {
      vErrors = [err29];
    } else {
      vErrors.push(err29);
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
  validate99.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate99.evaluated = { dynamicProps: true, dynamicItems: false };
function validate98(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate98.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.teamId === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
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
    if (data.actor === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "actor" },
        message: "must have required property '" + "actor" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.action === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "action" },
        message: "must have required property '" + "action" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.createTime === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "createTime" },
        message: "must have required property '" + "createTime" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.metadata === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "metadata" },
        message: "must have required property '" + "metadata" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.teamId !== undefined) {
      let data0 = data.teamId;
      if (typeof data0 === "string") {
        if (!pattern0.test(data0)) {
          const err5 = {
            instancePath: instancePath + "/teamId",
            schemaPath: "#/components/schemas/TeamId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      } else {
        const err6 = {
          instancePath: instancePath + "/teamId",
          schemaPath: "#/components/schemas/TeamId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.actor !== undefined) {
      if (
        !validate99(data.actor, {
          instancePath: instancePath + "/actor",
          parentData: data,
          parentDataProperty: "actor",
          rootData,
          dynamicAnchors,
        })
      ) {
        vErrors = vErrors === null ? validate99.errors : vErrors.concat(validate99.errors);
        errors = vErrors.length;
      }
    }
    if (data.action !== undefined) {
      let data2 = data.action;
      if (typeof data2 !== "string") {
        const err7 = {
          instancePath: instancePath + "/action",
          schemaPath: "#/properties/action/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
      if (
        !(
          data2 === "team:join" ||
          data2 === "team:create" ||
          data2 === "team:update" ||
          data2 === "team:delete" ||
          data2 === "project:create" ||
          data2 === "project:transfer" ||
          data2 === "project:receive" ||
          data2 === "project:update" ||
          data2 === "project:delete" ||
          data2 === "defaultEnvironmentVariable:create" ||
          data2 === "defaultEnvironmentVariable:update" ||
          data2 === "defaultEnvironmentVariable:delete" ||
          data2 === "deployment:create" ||
          data2 === "deployment:delete" ||
          data2 === "member:invite" ||
          data2 === "member:cancelInvitation" ||
          data2 === "member:remove" ||
          data2 === "member:updateRole" ||
          data2 === "project:updateMemberRole" ||
          data2 === "billing:paymentMethod:update" ||
          data2 === "billing:contact:update" ||
          data2 === "billing:address:update" ||
          data2 === "billing:subscription:create" ||
          data2 === "billing:subscription:resume" ||
          data2 === "billing:subscription:cancel" ||
          data2 === "billing:subscription:changePlan" ||
          data2 === "team:token:create" ||
          data2 === "team:token:update" ||
          data2 === "team:token:delete" ||
          data2 === "team:token:view" ||
          data2 === "project:token:create" ||
          data2 === "project:token:update" ||
          data2 === "project:token:delete" ||
          data2 === "project:token:view" ||
          data2 === "deployment:token:create" ||
          data2 === "deployment:token:update" ||
          data2 === "deployment:token:delete" ||
          data2 === "deployment:token:view" ||
          data2 === "member:token:createWithSsoAccess" ||
          data2 === "team:domain:create" ||
          data2 === "team:domain:delete" ||
          data2 === "deployment:customDomain:create" ||
          data2 === "deployment:customDomain:delete" ||
          data2 === "deployment:backups:create" ||
          data2 === "deployment:backups:import" ||
          data2 === "deployment:backups:configurePeriodic" ||
          data2 === "deployment:backups:disablePeriodic" ||
          data2 === "deployment:backups:delete" ||
          data2 === "team:disableExceedingSpendingLimits" ||
          data2 === "billing:spendingLimit:update" ||
          data2 === "team:applyReferralCode" ||
          data2 === "oauthApplication:create" ||
          data2 === "oauthApplication:update" ||
          data2 === "oauthApplication:delete" ||
          data2 === "oauthApplication:verify" ||
          data2 === "oauthApplication:generateClientSecret" ||
          data2 === "integration:workos:team:create" ||
          data2 === "integration:workos:environment:create" ||
          data2 === "integration:workos:environment:delete" ||
          data2 === "integration:workos:environment:retrieveCredentials" ||
          data2 === "integration:workos:team:disconnect" ||
          data2 === "integration:workos:team:inviteMember" ||
          data2 === "integration:workos:projectEnvironment:create" ||
          data2 === "integration:workos:projectEnvironment:delete" ||
          data2 === "integration:workos:projectEnvironment:retrieveCredentials" ||
          data2 === "sso:enable" ||
          data2 === "sso:disable" ||
          data2 === "sso:update" ||
          data2 === "directorySync:enable" ||
          data2 === "directorySync:disable" ||
          data2 === "directorySync:updateGroupMapping" ||
          data2 === "directorySync:deleteGroupMapping" ||
          data2 === "deployment:transfer" ||
          data2 === "deployment:receive" ||
          data2 === "deployment:update" ||
          data2 === "customRole:create" ||
          data2 === "customRole:update" ||
          data2 === "customRole:delete"
        )
      ) {
        const err8 = {
          instancePath: instancePath + "/action",
          schemaPath: "#/properties/action/enum",
          keyword: "enum",
          params: { allowedValues: schema182.properties.action.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.createTime !== undefined) {
      let data3 = data.createTime;
      if (!(typeof data3 == "number" && !(data3 % 1) && !isNaN(data3))) {
        const err9 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/properties/createTime/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.clientIp !== undefined) {
      let data5 = data.clientIp;
      if (typeof data5 !== "string" && data5 !== null) {
        const err10 = {
          instancePath: instancePath + "/clientIp",
          schemaPath: "#/properties/clientIp/type",
          keyword: "type",
          params: { type: schema182.properties.clientIp.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.clientUserAgent !== undefined) {
      let data6 = data.clientUserAgent;
      if (typeof data6 !== "string" && data6 !== null) {
        const err11 = {
          instancePath: instancePath + "/clientUserAgent",
          schemaPath: "#/properties/clientUserAgent/type",
          keyword: "type",
          params: { type: schema182.properties.clientUserAgent.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
  } else {
    const err12 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err12];
    } else {
      vErrors.push(err12);
    }
    errors++;
  }
  validate98.errors = vErrors;
  return errors === 0;
}
validate98.evaluated = {
  props: {
    teamId: true,
    actor: true,
    action: true,
    createTime: true,
    metadata: true,
    clientIp: true,
    clientUserAgent: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
function validate97(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate97.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.items === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "items" },
        message: "must have required property '" + "items" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.pagination === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "pagination" },
        message: "must have required property '" + "pagination" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.items !== undefined) {
      let data0 = data.items;
      if (Array.isArray(data0)) {
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate98(data0[i0], {
              instancePath: instancePath + "/items/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate98.errors : vErrors.concat(validate98.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err2 = {
          instancePath: instancePath + "/items",
          schemaPath: "#/properties/items/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.pagination !== undefined) {
      let data2 = data.pagination;
      if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
        if (data2.hasMore === undefined) {
          const err3 = {
            instancePath: instancePath + "/pagination",
            schemaPath: "#/components/schemas/PaginationMetadata/required",
            keyword: "required",
            params: { missingProperty: "hasMore" },
            message: "must have required property '" + "hasMore" + "'",
          };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data2.hasMore !== undefined) {
          if (typeof data2.hasMore !== "boolean") {
            const err4 = {
              instancePath: instancePath + "/pagination/hasMore",
              schemaPath: "#/components/schemas/PaginationMetadata/properties/hasMore/type",
              keyword: "type",
              params: { type: "boolean" },
              message: "must be boolean",
            };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data2.nextCursor !== undefined) {
          let data4 = data2.nextCursor;
          if (typeof data4 !== "string" && data4 !== null) {
            const err5 = {
              instancePath: instancePath + "/pagination/nextCursor",
              schemaPath: "#/components/schemas/PaginationMetadata/properties/nextCursor/type",
              keyword: "type",
              params: { type: schema21.properties.nextCursor.type },
              message: "must be string,null",
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
      } else {
        const err6 = {
          instancePath: instancePath + "/pagination",
          schemaPath: "#/components/schemas/PaginationMetadata/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
  } else {
    const err7 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err7];
    } else {
      vErrors.push(err7);
    }
    errors++;
  }
  validate97.errors = vErrors;
  return errors === 0;
}
validate97.evaluated = {
  props: { items: true, pagination: true },
  dynamicProps: false,
  dynamicItems: false,
};
function validate96(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate96.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate97(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate97.errors : vErrors.concat(validate97.errors);
    errors = vErrors.length;
  }
  validate96.errors = vErrors;
  return errors === 0;
}
validate96.evaluated = {
  props: { items: true, pagination: true },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvListPendingTeamInvitesResponse = validate103;
const schema190 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1list_pending_invites/get/responses/200/content/application~1json/schema",
};
const schema191 = {
  type: "object",
  required: ["items"],
  properties: {
    items: { type: "array", items: { $ref: "#/components/schemas/InvitationResponse" } },
  },
};
const schema192 = {
  type: "object",
  required: ["email", "expired", "role"],
  properties: {
    email: { type: "string" },
    expired: { type: "boolean" },
    role: { $ref: "#/components/schemas/Role" },
    customRoles: {
      type: ["array", "null"],
      items: { $ref: "#/components/schemas/TeamMemberCustomRole" },
      description: "The custom roles attached to this invitation. Present iff `role` is\n`custom`.",
    },
  },
};
function validate105(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate105.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.email === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "email" },
        message: "must have required property '" + "email" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.expired === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "expired" },
        message: "must have required property '" + "expired" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.role === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "role" },
        message: "must have required property '" + "role" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.email !== undefined) {
      if (typeof data.email !== "string") {
        const err3 = {
          instancePath: instancePath + "/email",
          schemaPath: "#/properties/email/type",
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
    if (data.expired !== undefined) {
      if (typeof data.expired !== "boolean") {
        const err4 = {
          instancePath: instancePath + "/expired",
          schemaPath: "#/properties/expired/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
        };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.role !== undefined) {
      let data2 = data.role;
      if (typeof data2 !== "string") {
        const err5 = {
          instancePath: instancePath + "/role",
          schemaPath: "#/components/schemas/Role/type",
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
      if (!(data2 === "admin" || data2 === "developer" || data2 === "custom")) {
        const err6 = {
          instancePath: instancePath + "/role",
          schemaPath: "#/components/schemas/Role/enum",
          keyword: "enum",
          params: { allowedValues: schema165.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.customRoles !== undefined) {
      let data3 = data.customRoles;
      if (!Array.isArray(data3) && data3 !== null) {
        const err7 = {
          instancePath: instancePath + "/customRoles",
          schemaPath: "#/properties/customRoles/type",
          keyword: "type",
          params: { type: schema192.properties.customRoles.type },
          message: "must be array,null",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
      if (Array.isArray(data3)) {
        const len0 = data3.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate88(data3[i0], {
              instancePath: instancePath + "/customRoles/" + i0,
              parentData: data3,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate88.errors : vErrors.concat(validate88.errors);
            errors = vErrors.length;
          }
        }
      }
    }
  } else {
    const err8 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err8];
    } else {
      vErrors.push(err8);
    }
    errors++;
  }
  validate105.errors = vErrors;
  return errors === 0;
}
validate105.evaluated = {
  props: { email: true, expired: true, role: true, customRoles: true },
  dynamicProps: false,
  dynamicItems: false,
};
function validate104(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate104.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.items === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "items" },
        message: "must have required property '" + "items" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.items !== undefined) {
      let data0 = data.items;
      if (Array.isArray(data0)) {
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate105(data0[i0], {
              instancePath: instancePath + "/items/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate105.errors : vErrors.concat(validate105.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err1 = {
          instancePath: instancePath + "/items",
          schemaPath: "#/properties/items/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
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
  validate104.errors = vErrors;
  return errors === 0;
}
validate104.evaluated = { props: { items: true }, dynamicProps: false, dynamicItems: false };
function validate103(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate103.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate104(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate104.errors : vErrors.concat(validate104.errors);
    errors = vErrors.length;
  }
  validate103.errors = vErrors;
  return errors === 0;
}
validate103.evaluated = { props: { items: true }, dynamicProps: false, dynamicItems: false };
export const ajvListDefaultEnvironmentVariablesResponse = validate109;
const schema194 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1projects~1{project_id}~1list_default_environment_variables/get/responses/200/content/application~1json/schema",
};
const schema195 = {
  type: "object",
  required: ["items", "pagination"],
  properties: {
    items: {
      type: "array",
      items: { $ref: "#/components/schemas/DefaultEnvironmentVariableResponse" },
    },
    pagination: { $ref: "#/components/schemas/PaginationMetadata" },
  },
};
const schema196 = {
  type: "object",
  required: ["name", "value", "deploymentTypes"],
  properties: {
    name: { type: "string" },
    value: { type: "string" },
    deploymentTypes: {
      type: "array",
      items: { $ref: "#/components/schemas/DeploymentType" },
      description:
        "The deployment types that this env var name + value apply to.\nNote that when filtering by a particular deployment type,\nall items in the result will have a single element\nin `deploymentType`.",
    },
  },
};
function validate111(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate111.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.name === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "name" },
        message: "must have required property '" + "name" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.value === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "value" },
        message: "must have required property '" + "value" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.deploymentTypes === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "deploymentTypes" },
        message: "must have required property '" + "deploymentTypes" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err3 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/properties/name/type",
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
    if (data.value !== undefined) {
      if (typeof data.value !== "string") {
        const err4 = {
          instancePath: instancePath + "/value",
          schemaPath: "#/properties/value/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.deploymentTypes !== undefined) {
      let data2 = data.deploymentTypes;
      if (Array.isArray(data2)) {
        const len0 = data2.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data3 = data2[i0];
          if (typeof data3 !== "string") {
            const err5 = {
              instancePath: instancePath + "/deploymentTypes/" + i0,
              schemaPath: "#/components/schemas/DeploymentType/type",
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
          if (!(data3 === "dev" || data3 === "prod" || data3 === "preview" || data3 === "custom")) {
            const err6 = {
              instancePath: instancePath + "/deploymentTypes/" + i0,
              schemaPath: "#/components/schemas/DeploymentType/enum",
              keyword: "enum",
              params: { allowedValues: schema26.enum },
              message: "must be equal to one of the allowed values",
            };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
      } else {
        const err7 = {
          instancePath: instancePath + "/deploymentTypes",
          schemaPath: "#/properties/deploymentTypes/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
  } else {
    const err8 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err8];
    } else {
      vErrors.push(err8);
    }
    errors++;
  }
  validate111.errors = vErrors;
  return errors === 0;
}
validate111.evaluated = {
  props: { name: true, value: true, deploymentTypes: true },
  dynamicProps: false,
  dynamicItems: false,
};
function validate110(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate110.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.items === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "items" },
        message: "must have required property '" + "items" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.pagination === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "pagination" },
        message: "must have required property '" + "pagination" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.items !== undefined) {
      let data0 = data.items;
      if (Array.isArray(data0)) {
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate111(data0[i0], {
              instancePath: instancePath + "/items/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate111.errors : vErrors.concat(validate111.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err2 = {
          instancePath: instancePath + "/items",
          schemaPath: "#/properties/items/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.pagination !== undefined) {
      let data2 = data.pagination;
      if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
        if (data2.hasMore === undefined) {
          const err3 = {
            instancePath: instancePath + "/pagination",
            schemaPath: "#/components/schemas/PaginationMetadata/required",
            keyword: "required",
            params: { missingProperty: "hasMore" },
            message: "must have required property '" + "hasMore" + "'",
          };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data2.hasMore !== undefined) {
          if (typeof data2.hasMore !== "boolean") {
            const err4 = {
              instancePath: instancePath + "/pagination/hasMore",
              schemaPath: "#/components/schemas/PaginationMetadata/properties/hasMore/type",
              keyword: "type",
              params: { type: "boolean" },
              message: "must be boolean",
            };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data2.nextCursor !== undefined) {
          let data4 = data2.nextCursor;
          if (typeof data4 !== "string" && data4 !== null) {
            const err5 = {
              instancePath: instancePath + "/pagination/nextCursor",
              schemaPath: "#/components/schemas/PaginationMetadata/properties/nextCursor/type",
              keyword: "type",
              params: { type: schema21.properties.nextCursor.type },
              message: "must be string,null",
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
      } else {
        const err6 = {
          instancePath: instancePath + "/pagination",
          schemaPath: "#/components/schemas/PaginationMetadata/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
  } else {
    const err7 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err7];
    } else {
      vErrors.push(err7);
    }
    errors++;
  }
  validate110.errors = vErrors;
  return errors === 0;
}
validate110.evaluated = {
  props: { items: true, pagination: true },
  dynamicProps: false,
  dynamicItems: false,
};
function validate109(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate109.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate110(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate110.errors : vErrors.concat(validate110.errors);
    errors = vErrors.length;
  }
  validate109.errors = vErrors;
  return errors === 0;
}
validate109.evaluated = {
  props: { items: true, pagination: true },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvCreateCustomRoleResponse = validate114;
const schema199 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1create_custom_role/post/responses/201/content/application~1json/schema",
};
const schema200 = {
  type: "object",
  required: ["id", "teamId", "name", "statements", "createTime"],
  properties: {
    id: { $ref: "#/components/schemas/CustomRoleId" },
    teamId: { $ref: "#/components/schemas/TeamId" },
    name: { type: "string" },
    description: { type: ["string", "null"] },
    statements: { type: "array", items: { $ref: "#/components/schemas/RoleStatement" } },
    creator: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/MemberId" }] },
    createTime: { type: "integer", format: "int64" },
  },
};
const schema203 = {
  type: "object",
  description: "A single permission rule within a custom role.",
  required: ["effect", "actions", "resource"],
  properties: {
    effect: { $ref: "#/components/schemas/RoleStatementEffect" },
    actions: { $ref: "#/components/schemas/RoleStatementActions" },
    resource: {
      type: "string",
      description:
        "Resource path like `project:*`, `project:slug=my-app`, or\n`project:*:deployment:type=prod`.",
      example: "project:*",
    },
  },
};
const schema204 = {
  type: "string",
  description: "Whether a rule grants or revokes access.",
  enum: ["allow", "deny"],
};
const schema205 = {
  oneOf: [
    { $ref: "#/components/schemas/RoleStatementWildcardAction" },
    { type: "array", items: { $ref: "#/components/schemas/RoleStatementAction" } },
  ],
};
const schema206 = { type: "string", enum: ["*"] };
const schema207 = {
  type: "string",
  description: "An action that can be allowed or denied by a custom role statement.",
  enum: [
    "team:update",
    "team:delete",
    "project:create",
    "project:transfer",
    "project:receive",
    "project:update",
    "project:delete",
    "project:view",
    "project:updateMemberRole",
    "defaultEnvironmentVariable:create",
    "defaultEnvironmentVariable:update",
    "defaultEnvironmentVariable:delete",
    "defaultEnvironmentVariable:view",
    "deployment:create",
    "deployment:transfer",
    "deployment:receive",
    "deployment:updateReference",
    "deployment:updateDashboardEditConfirmation",
    "deployment:updateExpiresAt",
    "deployment:updateSendLogsToClient",
    "deployment:updateClass",
    "deployment:updateIsDefault",
    "deployment:updateType",
    "deployment:delete",
    "deployment:view",
    "deployment:integrations:view",
    "deployment:integrations:write",
    "deployment:customDomain:create",
    "deployment:customDomain:delete",
    "deployment:customDomain:view",
    "member:invite",
    "member:cancelInvitation",
    "member:remove",
    "member:updateRole",
    "member:view",
    "billing:paymentMethod:update",
    "billing:contact:update",
    "billing:address:update",
    "billing:subscription:changePlan",
    "billing:spendingLimit:update",
    "billing:view",
    "billing:invoices:view",
    "team:auditLog:view",
    "team:domain:create",
    "team:domain:delete",
    "team:domain:view",
    "team:token:create",
    "team:token:update",
    "team:token:delete",
    "team:token:view",
    "project:token:create",
    "project:token:update",
    "project:token:delete",
    "project:token:view",
    "deployment:token:create",
    "deployment:token:update",
    "deployment:token:delete",
    "deployment:token:view",
    "oauthApplication:create",
    "oauthApplication:update",
    "oauthApplication:delete",
    "oauthApplication:view",
    "oauthApplication:generateClientSecret",
    "team:usage:view",
    "deployment:insights:view",
    "deployment:backups:create",
    "deployment:backups:import",
    "deployment:backups:configurePeriodic",
    "deployment:backups:disablePeriodic",
    "deployment:backups:delete",
    "deployment:backups:view",
    "sso:enable",
    "sso:disable",
    "sso:update",
    "sso:view",
    "directorySync:enable",
    "directorySync:disable",
    "directorySync:updateGroupMapping",
    "directorySync:deleteGroupMapping",
    "directorySync:view",
    "customRole:view",
    "integration:view",
    "integration:create",
    "integration:update",
    "integration:delete",
    "deployment:deploy",
    "deployment:env:view",
    "deployment:env:write",
    "deployment:pause",
    "deployment:unpause",
    "deployment:logs:view",
    "deployment:metrics:view",
    "deployment:data:view",
    "deployment:data:write",
    "deployment:backups:download",
    "deployment:functions:actAsUser",
    "deployment:functions:runInternalQueries",
    "deployment:functions:runInternalMutations",
    "deployment:functions:runInternalActions",
    "deployment:functions:runTestQuery",
    "deployment:auditLog:view",
    "deployment:usageLimits:view",
    "deployment:usageLimits:write",
    "deployment:usage:view",
    "deployment:aiGateway:use",
  ],
};
function validate117(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate117.evaluated;
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
  if (typeof data !== "string") {
    const err0 = {
      instancePath,
      schemaPath: "#/components/schemas/RoleStatementWildcardAction/type",
      keyword: "type",
      params: { type: "string" },
      message: "must be string",
    };
    if (vErrors === null) {
      vErrors = [err0];
    } else {
      vErrors.push(err0);
    }
    errors++;
  }
  if (!(data === "*")) {
    const err1 = {
      instancePath,
      schemaPath: "#/components/schemas/RoleStatementWildcardAction/enum",
      keyword: "enum",
      params: { allowedValues: schema206.enum },
      message: "must be equal to one of the allowed values",
    };
    if (vErrors === null) {
      vErrors = [err1];
    } else {
      vErrors.push(err1);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs4 = errors;
  if (Array.isArray(data)) {
    const len0 = data.length;
    for (let i0 = 0; i0 < len0; i0++) {
      let data0 = data[i0];
      if (typeof data0 !== "string") {
        const err2 = {
          instancePath: instancePath + "/" + i0,
          schemaPath: "#/components/schemas/RoleStatementAction/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
      if (
        !(
          data0 === "team:update" ||
          data0 === "team:delete" ||
          data0 === "project:create" ||
          data0 === "project:transfer" ||
          data0 === "project:receive" ||
          data0 === "project:update" ||
          data0 === "project:delete" ||
          data0 === "project:view" ||
          data0 === "project:updateMemberRole" ||
          data0 === "defaultEnvironmentVariable:create" ||
          data0 === "defaultEnvironmentVariable:update" ||
          data0 === "defaultEnvironmentVariable:delete" ||
          data0 === "defaultEnvironmentVariable:view" ||
          data0 === "deployment:create" ||
          data0 === "deployment:transfer" ||
          data0 === "deployment:receive" ||
          data0 === "deployment:updateReference" ||
          data0 === "deployment:updateDashboardEditConfirmation" ||
          data0 === "deployment:updateExpiresAt" ||
          data0 === "deployment:updateSendLogsToClient" ||
          data0 === "deployment:updateClass" ||
          data0 === "deployment:updateIsDefault" ||
          data0 === "deployment:updateType" ||
          data0 === "deployment:delete" ||
          data0 === "deployment:view" ||
          data0 === "deployment:integrations:view" ||
          data0 === "deployment:integrations:write" ||
          data0 === "deployment:customDomain:create" ||
          data0 === "deployment:customDomain:delete" ||
          data0 === "deployment:customDomain:view" ||
          data0 === "member:invite" ||
          data0 === "member:cancelInvitation" ||
          data0 === "member:remove" ||
          data0 === "member:updateRole" ||
          data0 === "member:view" ||
          data0 === "billing:paymentMethod:update" ||
          data0 === "billing:contact:update" ||
          data0 === "billing:address:update" ||
          data0 === "billing:subscription:changePlan" ||
          data0 === "billing:spendingLimit:update" ||
          data0 === "billing:view" ||
          data0 === "billing:invoices:view" ||
          data0 === "team:auditLog:view" ||
          data0 === "team:domain:create" ||
          data0 === "team:domain:delete" ||
          data0 === "team:domain:view" ||
          data0 === "team:token:create" ||
          data0 === "team:token:update" ||
          data0 === "team:token:delete" ||
          data0 === "team:token:view" ||
          data0 === "project:token:create" ||
          data0 === "project:token:update" ||
          data0 === "project:token:delete" ||
          data0 === "project:token:view" ||
          data0 === "deployment:token:create" ||
          data0 === "deployment:token:update" ||
          data0 === "deployment:token:delete" ||
          data0 === "deployment:token:view" ||
          data0 === "oauthApplication:create" ||
          data0 === "oauthApplication:update" ||
          data0 === "oauthApplication:delete" ||
          data0 === "oauthApplication:view" ||
          data0 === "oauthApplication:generateClientSecret" ||
          data0 === "team:usage:view" ||
          data0 === "deployment:insights:view" ||
          data0 === "deployment:backups:create" ||
          data0 === "deployment:backups:import" ||
          data0 === "deployment:backups:configurePeriodic" ||
          data0 === "deployment:backups:disablePeriodic" ||
          data0 === "deployment:backups:delete" ||
          data0 === "deployment:backups:view" ||
          data0 === "sso:enable" ||
          data0 === "sso:disable" ||
          data0 === "sso:update" ||
          data0 === "sso:view" ||
          data0 === "directorySync:enable" ||
          data0 === "directorySync:disable" ||
          data0 === "directorySync:updateGroupMapping" ||
          data0 === "directorySync:deleteGroupMapping" ||
          data0 === "directorySync:view" ||
          data0 === "customRole:view" ||
          data0 === "integration:view" ||
          data0 === "integration:create" ||
          data0 === "integration:update" ||
          data0 === "integration:delete" ||
          data0 === "deployment:deploy" ||
          data0 === "deployment:env:view" ||
          data0 === "deployment:env:write" ||
          data0 === "deployment:pause" ||
          data0 === "deployment:unpause" ||
          data0 === "deployment:logs:view" ||
          data0 === "deployment:metrics:view" ||
          data0 === "deployment:data:view" ||
          data0 === "deployment:data:write" ||
          data0 === "deployment:backups:download" ||
          data0 === "deployment:functions:actAsUser" ||
          data0 === "deployment:functions:runInternalQueries" ||
          data0 === "deployment:functions:runInternalMutations" ||
          data0 === "deployment:functions:runInternalActions" ||
          data0 === "deployment:functions:runTestQuery" ||
          data0 === "deployment:auditLog:view" ||
          data0 === "deployment:usageLimits:view" ||
          data0 === "deployment:usageLimits:write" ||
          data0 === "deployment:usage:view" ||
          data0 === "deployment:aiGateway:use"
        )
      ) {
        const err3 = {
          instancePath: instancePath + "/" + i0,
          schemaPath: "#/components/schemas/RoleStatementAction/enum",
          keyword: "enum",
          params: { allowedValues: schema207.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
  } else {
    const err4 = {
      instancePath,
      schemaPath: "#/oneOf/1/type",
      keyword: "type",
      params: { type: "array" },
      message: "must be array",
    };
    if (vErrors === null) {
      vErrors = [err4];
    } else {
      vErrors.push(err4);
    }
    errors++;
  }
  var _valid0 = _errs4 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
      var items0 = true;
    }
  }
  if (!valid0) {
    const err5 = {
      instancePath,
      schemaPath: "#/oneOf",
      keyword: "oneOf",
      params: { passingSchemas: passing0 },
      message: "must match exactly one schema in oneOf",
    };
    if (vErrors === null) {
      vErrors = [err5];
    } else {
      vErrors.push(err5);
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
  validate117.errors = vErrors;
  evaluated0.items = items0;
  return errors === 0;
}
validate117.evaluated = { dynamicProps: false, dynamicItems: true };
function validate116(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate116.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.effect === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "effect" },
        message: "must have required property '" + "effect" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.actions === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "actions" },
        message: "must have required property '" + "actions" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.resource === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "resource" },
        message: "must have required property '" + "resource" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.effect !== undefined) {
      let data0 = data.effect;
      if (typeof data0 !== "string") {
        const err3 = {
          instancePath: instancePath + "/effect",
          schemaPath: "#/components/schemas/RoleStatementEffect/type",
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
      if (!(data0 === "allow" || data0 === "deny")) {
        const err4 = {
          instancePath: instancePath + "/effect",
          schemaPath: "#/components/schemas/RoleStatementEffect/enum",
          keyword: "enum",
          params: { allowedValues: schema204.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.actions !== undefined) {
      if (
        !validate117(data.actions, {
          instancePath: instancePath + "/actions",
          parentData: data,
          parentDataProperty: "actions",
          rootData,
          dynamicAnchors,
        })
      ) {
        vErrors = vErrors === null ? validate117.errors : vErrors.concat(validate117.errors);
        errors = vErrors.length;
      }
    }
    if (data.resource !== undefined) {
      if (typeof data.resource !== "string") {
        const err5 = {
          instancePath: instancePath + "/resource",
          schemaPath: "#/properties/resource/type",
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
  } else {
    const err6 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err6];
    } else {
      vErrors.push(err6);
    }
    errors++;
  }
  validate116.errors = vErrors;
  return errors === 0;
}
validate116.evaluated = {
  props: { effect: true, actions: true, resource: true },
  dynamicProps: false,
  dynamicItems: false,
};
function validate115(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate115.evaluated;
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
    if (data.teamId === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "teamId" },
        message: "must have required property '" + "teamId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.name === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "name" },
        message: "must have required property '" + "name" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.statements === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "statements" },
        message: "must have required property '" + "statements" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.createTime === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "createTime" },
        message: "must have required property '" + "createTime" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern0.test(data0)) {
          const err5 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/CustomRoleId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      } else {
        const err6 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/CustomRoleId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.teamId !== undefined) {
      let data1 = data.teamId;
      if (typeof data1 === "string") {
        if (!pattern0.test(data1)) {
          const err7 = {
            instancePath: instancePath + "/teamId",
            schemaPath: "#/components/schemas/TeamId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      } else {
        const err8 = {
          instancePath: instancePath + "/teamId",
          schemaPath: "#/components/schemas/TeamId/type",
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
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err9 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/properties/name/type",
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
    if (data.description !== undefined) {
      let data3 = data.description;
      if (typeof data3 !== "string" && data3 !== null) {
        const err10 = {
          instancePath: instancePath + "/description",
          schemaPath: "#/properties/description/type",
          keyword: "type",
          params: { type: schema200.properties.description.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.statements !== undefined) {
      let data4 = data.statements;
      if (Array.isArray(data4)) {
        const len0 = data4.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate116(data4[i0], {
              instancePath: instancePath + "/statements/" + i0,
              parentData: data4,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate116.errors : vErrors.concat(validate116.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err11 = {
          instancePath: instancePath + "/statements",
          schemaPath: "#/properties/statements/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.creator !== undefined) {
      let data6 = data.creator;
      const _errs15 = errors;
      let valid5 = false;
      let passing0 = null;
      const _errs16 = errors;
      if (data6 !== null) {
        const err12 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/properties/creator/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
      var _valid0 = _errs16 === errors;
      if (_valid0) {
        valid5 = true;
        passing0 = 0;
      }
      const _errs18 = errors;
      if (typeof data6 === "string") {
        if (!pattern0.test(data6)) {
          const err13 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
      } else {
        const err14 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
      var _valid0 = _errs18 === errors;
      if (_valid0 && valid5) {
        valid5 = false;
        passing0 = [passing0, 1];
      } else {
        if (_valid0) {
          valid5 = true;
          passing0 = 1;
        }
      }
      if (!valid5) {
        const err15 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/properties/creator/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing0 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      } else {
        errors = _errs15;
        if (vErrors !== null) {
          if (_errs15) {
            vErrors.length = _errs15;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.createTime !== undefined) {
      let data7 = data.createTime;
      if (!(typeof data7 == "number" && !(data7 % 1) && !isNaN(data7))) {
        const err16 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/properties/createTime/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
  } else {
    const err17 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err17];
    } else {
      vErrors.push(err17);
    }
    errors++;
  }
  validate115.errors = vErrors;
  return errors === 0;
}
validate115.evaluated = {
  props: {
    id: true,
    teamId: true,
    name: true,
    description: true,
    statements: true,
    creator: true,
    createTime: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
function validate114(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate114.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate115(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate115.errors : vErrors.concat(validate115.errors);
    errors = vErrors.length;
  }
  validate114.errors = vErrors;
  return errors === 0;
}
validate114.evaluated = {
  props: {
    id: true,
    teamId: true,
    name: true,
    description: true,
    statements: true,
    creator: true,
    createTime: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvListCustomRolesResponse = validate121;
const schema209 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1list_custom_roles/get/responses/200/content/application~1json/schema",
};
const schema210 = {
  type: "object",
  required: ["items", "pagination"],
  properties: {
    items: { type: "array", items: { $ref: "#/components/schemas/CustomRoleResponse" } },
    pagination: { $ref: "#/components/schemas/PaginationMetadata" },
  },
};
function validate123(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate123.evaluated;
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
    if (data.teamId === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "teamId" },
        message: "must have required property '" + "teamId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.name === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "name" },
        message: "must have required property '" + "name" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.statements === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "statements" },
        message: "must have required property '" + "statements" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.createTime === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "createTime" },
        message: "must have required property '" + "createTime" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern0.test(data0)) {
          const err5 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/CustomRoleId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      } else {
        const err6 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/CustomRoleId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.teamId !== undefined) {
      let data1 = data.teamId;
      if (typeof data1 === "string") {
        if (!pattern0.test(data1)) {
          const err7 = {
            instancePath: instancePath + "/teamId",
            schemaPath: "#/components/schemas/TeamId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      } else {
        const err8 = {
          instancePath: instancePath + "/teamId",
          schemaPath: "#/components/schemas/TeamId/type",
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
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err9 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/properties/name/type",
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
    if (data.description !== undefined) {
      let data3 = data.description;
      if (typeof data3 !== "string" && data3 !== null) {
        const err10 = {
          instancePath: instancePath + "/description",
          schemaPath: "#/properties/description/type",
          keyword: "type",
          params: { type: schema200.properties.description.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.statements !== undefined) {
      let data4 = data.statements;
      if (Array.isArray(data4)) {
        const len0 = data4.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate116(data4[i0], {
              instancePath: instancePath + "/statements/" + i0,
              parentData: data4,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate116.errors : vErrors.concat(validate116.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err11 = {
          instancePath: instancePath + "/statements",
          schemaPath: "#/properties/statements/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.creator !== undefined) {
      let data6 = data.creator;
      const _errs15 = errors;
      let valid5 = false;
      let passing0 = null;
      const _errs16 = errors;
      if (data6 !== null) {
        const err12 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/properties/creator/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
      var _valid0 = _errs16 === errors;
      if (_valid0) {
        valid5 = true;
        passing0 = 0;
      }
      const _errs18 = errors;
      if (typeof data6 === "string") {
        if (!pattern0.test(data6)) {
          const err13 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
      } else {
        const err14 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
      var _valid0 = _errs18 === errors;
      if (_valid0 && valid5) {
        valid5 = false;
        passing0 = [passing0, 1];
      } else {
        if (_valid0) {
          valid5 = true;
          passing0 = 1;
        }
      }
      if (!valid5) {
        const err15 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/properties/creator/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing0 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      } else {
        errors = _errs15;
        if (vErrors !== null) {
          if (_errs15) {
            vErrors.length = _errs15;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.createTime !== undefined) {
      let data7 = data.createTime;
      if (!(typeof data7 == "number" && !(data7 % 1) && !isNaN(data7))) {
        const err16 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/properties/createTime/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
  } else {
    const err17 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err17];
    } else {
      vErrors.push(err17);
    }
    errors++;
  }
  validate123.errors = vErrors;
  return errors === 0;
}
validate123.evaluated = {
  props: {
    id: true,
    teamId: true,
    name: true,
    description: true,
    statements: true,
    creator: true,
    createTime: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
function validate122(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate122.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.items === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "items" },
        message: "must have required property '" + "items" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.pagination === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "pagination" },
        message: "must have required property '" + "pagination" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.items !== undefined) {
      let data0 = data.items;
      if (Array.isArray(data0)) {
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate123(data0[i0], {
              instancePath: instancePath + "/items/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate123.errors : vErrors.concat(validate123.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err2 = {
          instancePath: instancePath + "/items",
          schemaPath: "#/properties/items/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.pagination !== undefined) {
      let data2 = data.pagination;
      if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
        if (data2.hasMore === undefined) {
          const err3 = {
            instancePath: instancePath + "/pagination",
            schemaPath: "#/components/schemas/PaginationMetadata/required",
            keyword: "required",
            params: { missingProperty: "hasMore" },
            message: "must have required property '" + "hasMore" + "'",
          };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data2.hasMore !== undefined) {
          if (typeof data2.hasMore !== "boolean") {
            const err4 = {
              instancePath: instancePath + "/pagination/hasMore",
              schemaPath: "#/components/schemas/PaginationMetadata/properties/hasMore/type",
              keyword: "type",
              params: { type: "boolean" },
              message: "must be boolean",
            };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data2.nextCursor !== undefined) {
          let data4 = data2.nextCursor;
          if (typeof data4 !== "string" && data4 !== null) {
            const err5 = {
              instancePath: instancePath + "/pagination/nextCursor",
              schemaPath: "#/components/schemas/PaginationMetadata/properties/nextCursor/type",
              keyword: "type",
              params: { type: schema21.properties.nextCursor.type },
              message: "must be string,null",
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
      } else {
        const err6 = {
          instancePath: instancePath + "/pagination",
          schemaPath: "#/components/schemas/PaginationMetadata/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
  } else {
    const err7 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err7];
    } else {
      vErrors.push(err7);
    }
    errors++;
  }
  validate122.errors = vErrors;
  return errors === 0;
}
validate122.evaluated = {
  props: { items: true, pagination: true },
  dynamicProps: false,
  dynamicItems: false,
};
function validate121(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate121.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate122(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate122.errors : vErrors.concat(validate122.errors);
    errors = vErrors.length;
  }
  validate121.errors = vErrors;
  return errors === 0;
}
validate121.evaluated = {
  props: { items: true, pagination: true },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvUpdateCustomRoleResponse = validate127;
const schema216 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1update_custom_role/post/responses/200/content/application~1json/schema",
};
function validate128(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate128.evaluated;
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
    if (data.teamId === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "teamId" },
        message: "must have required property '" + "teamId" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.name === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "name" },
        message: "must have required property '" + "name" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.statements === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "statements" },
        message: "must have required property '" + "statements" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.createTime === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "createTime" },
        message: "must have required property '" + "createTime" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern0.test(data0)) {
          const err5 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/CustomRoleId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      } else {
        const err6 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/CustomRoleId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.teamId !== undefined) {
      let data1 = data.teamId;
      if (typeof data1 === "string") {
        if (!pattern0.test(data1)) {
          const err7 = {
            instancePath: instancePath + "/teamId",
            schemaPath: "#/components/schemas/TeamId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      } else {
        const err8 = {
          instancePath: instancePath + "/teamId",
          schemaPath: "#/components/schemas/TeamId/type",
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
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err9 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/properties/name/type",
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
    if (data.description !== undefined) {
      let data3 = data.description;
      if (typeof data3 !== "string" && data3 !== null) {
        const err10 = {
          instancePath: instancePath + "/description",
          schemaPath: "#/properties/description/type",
          keyword: "type",
          params: { type: schema200.properties.description.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.statements !== undefined) {
      let data4 = data.statements;
      if (Array.isArray(data4)) {
        const len0 = data4.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate116(data4[i0], {
              instancePath: instancePath + "/statements/" + i0,
              parentData: data4,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate116.errors : vErrors.concat(validate116.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err11 = {
          instancePath: instancePath + "/statements",
          schemaPath: "#/properties/statements/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.creator !== undefined) {
      let data6 = data.creator;
      const _errs15 = errors;
      let valid5 = false;
      let passing0 = null;
      const _errs16 = errors;
      if (data6 !== null) {
        const err12 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/properties/creator/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
      var _valid0 = _errs16 === errors;
      if (_valid0) {
        valid5 = true;
        passing0 = 0;
      }
      const _errs18 = errors;
      if (typeof data6 === "string") {
        if (!pattern0.test(data6)) {
          const err13 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
      } else {
        const err14 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
      var _valid0 = _errs18 === errors;
      if (_valid0 && valid5) {
        valid5 = false;
        passing0 = [passing0, 1];
      } else {
        if (_valid0) {
          valid5 = true;
          passing0 = 1;
        }
      }
      if (!valid5) {
        const err15 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/properties/creator/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing0 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      } else {
        errors = _errs15;
        if (vErrors !== null) {
          if (_errs15) {
            vErrors.length = _errs15;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.createTime !== undefined) {
      let data7 = data.createTime;
      if (!(typeof data7 == "number" && !(data7 % 1) && !isNaN(data7))) {
        const err16 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/properties/createTime/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
  } else {
    const err17 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err17];
    } else {
      vErrors.push(err17);
    }
    errors++;
  }
  validate128.errors = vErrors;
  return errors === 0;
}
validate128.evaluated = {
  props: {
    id: true,
    teamId: true,
    name: true,
    description: true,
    statements: true,
    creator: true,
    createTime: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
function validate127(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate127.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate128(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate128.errors : vErrors.concat(validate128.errors);
    errors = vErrors.length;
  }
  validate127.errors = vErrors;
  return errors === 0;
}
validate127.evaluated = {
  props: {
    id: true,
    teamId: true,
    name: true,
    description: true,
    statements: true,
    creator: true,
    createTime: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
export const convexManagementResponseValidators = {
  GET: {
    "/projects/{project_id}": ajvGetProjectByIdResponse,
    "/teams/{team_id}/projects": ajvListProjectsResponse,
    "/projects/{project_id}/list_deployments": ajvListDeploymentsResponse,
    "/projects/{project_id}/deployment": ajvGetDeploymentInProjectByProjectIdResponse,
    "/teams/{team_id_or_slug}/projects/{project_slug}/deployment":
      ajvGetDeploymentInProjectByProjectSlugResponse,
    "/teams/{team_id_or_slug}/projects/{project_slug}": ajvGetProjectBySlugResponse,
    "/deployments/{deployment_name}": ajvPlatformGetDeploymentResponse,
    "/teams/{team_id}/list_deployment_classes": ajvListDeploymentClassesResponse,
    "/teams/{team_id}/list_deployment_regions": ajvListDeploymentRegionsResponse,
    "/teams/{team_id}/list_deployments": ajvListDeploymentsForTeamResponse,
    "/teams/{team_id}/list_local_deployments": ajvListLocalDeploymentsForTeamResponse,
    "/deployments/{deployment_name}/list_deploy_keys": ajvListDeployKeysResponse,
    "/projects/{project_id}/list_preview_deploy_keys": ajvListPreviewDeployKeysResponse,
    "/list_personal_access_tokens": ajvListPersonalAccessTokensResponse,
    "/teams/{team_id}/list_access_tokens": ajvListTeamAccessTokensResponse,
    "/token_details": ajvGetTokenDetailsResponse,
    "/deployments/{deployment_name}/custom_domains": ajvListCustomDomainsResponse,
    "/teams/{team_id}/list_members": ajvListTeamMembersResponse,
    "/teams/{team_id}/list_audit_log_events": ajvListAuditLogEventsResponse,
    "/teams/{team_id}/list_pending_invites": ajvListPendingTeamInvitesResponse,
    "/projects/{project_id}/list_default_environment_variables":
      ajvListDefaultEnvironmentVariablesResponse,
    "/teams/{team_id}/list_custom_roles": ajvListCustomRolesResponse,
  },

  POST: {
    "/teams/{team_id}/create_project": ajvCreateProjectResponse,
    "/projects/{project_id}/delete": null,
    "/projects/{project_id}/create_deployment": ajvCreateDeploymentResponse,
    "/deployments/{deployment_name}/delete": null,
    "/deployments/{deployment_name}/transfer": null,
    "/deployments/{deployment_name}/mint_ai_gateway_jwt": ajvMintAiGatewayJwtResponse,
    "/deployments/{deployment_name}/create_deploy_key": ajvCreateDeployKeyResponse,
    "/deployments/{deployment_name}/delete_deploy_key": null,
    "/projects/{project_id}/create_preview_deploy_key": ajvCreatePreviewDeployKeyResponse,
    "/projects/{project_id}/delete_preview_deploy_key": null,
    "/create_personal_access_token": ajvCreatePersonalAccessTokenResponse,
    "/delete_personal_access_token": null,
    "/teams/{team_id}/delete_access_token": null,
    "/deployments/{deployment_name}/create_custom_domain": null,
    "/deployments/{deployment_name}/delete_custom_domain": null,
    "/teams/create_team": ajvCreateTeamResponse,
    "/teams/{team_id}/create_access_token": ajvCreateTeamAccessTokenResponse,
    "/teams/{team_id}/invite_team_member": null,
    "/teams/{team_id}/cancel_team_member_invite": null,
    "/projects/{project_id}/update_default_environment_variables": null,
    "/teams/{team_id}/create_custom_role": ajvCreateCustomRoleResponse,
    "/teams/{team_id}/update_custom_role": ajvUpdateCustomRoleResponse,
    "/teams/{team_id}/delete_custom_role": null,
    "/teams/{team_id}/update_team_member_role": null,
  },
};

export const convexManagementResponseDecimalPaths = {
  GET: {
    "/projects/{project_id}": [["id"], ["teamId"]],
    "/teams/{team_id}/projects": [
      ["items", "*", "id"],
      ["items", "*", "teamId"],
    ],
    "/projects/{project_id}/list_deployments": [
      ["*", "creator"],
      ["*", "id"],
      ["*", "projectId"],
    ],
    "/projects/{project_id}/deployment": [["creator"], ["id"], ["projectId"]],
    "/teams/{team_id_or_slug}/projects/{project_slug}/deployment": [
      ["creator"],
      ["id"],
      ["projectId"],
    ],
    "/teams/{team_id_or_slug}/projects/{project_slug}": [["id"], ["teamId"]],
    "/deployments/{deployment_name}": [["creator"], ["id"], ["projectId"]],
    "/teams/{team_id}/list_deployment_classes": [],
    "/teams/{team_id}/list_deployment_regions": [],
    "/teams/{team_id}/list_deployments": [
      ["items", "*", "creator"],
      ["items", "*", "id"],
      ["items", "*", "projectId"],
    ],
    "/teams/{team_id}/list_local_deployments": [
      ["items", "*", "creator"],
      ["items", "*", "id"],
      ["items", "*", "projectId"],
    ],
    "/deployments/{deployment_name}/list_deploy_keys": [
      ["*", "creator"],
      ["*", "id"],
    ],
    "/projects/{project_id}/list_preview_deploy_keys": [
      ["items", "*", "creator"],
      ["items", "*", "id"],
    ],
    "/list_personal_access_tokens": [
      ["items", "*", "id"],
      ["items", "*", "ssoTeamId"],
    ],
    "/teams/{team_id}/list_access_tokens": [
      ["items", "*", "creator"],
      ["items", "*", "id"],
    ],
    "/token_details": [["id"], ["projectId"], ["teamId"]],
    "/deployments/{deployment_name}/custom_domains": [],
    "/teams/{team_id}/list_members": [
      ["items", "*", "customRoles", "*", "id"],
      ["items", "*", "id"],
    ],
    "/teams/{team_id}/list_audit_log_events": [
      ["items", "*", "actor", "member_id"],
      ["items", "*", "actor", "token_id"],
      ["items", "*", "teamId"],
    ],
    "/teams/{team_id}/list_pending_invites": [["items", "*", "customRoles", "*", "id"]],
    "/projects/{project_id}/list_default_environment_variables": [],
    "/teams/{team_id}/list_custom_roles": [
      ["items", "*", "creator"],
      ["items", "*", "id"],
      ["items", "*", "teamId"],
    ],
  },

  POST: {
    "/teams/{team_id}/create_project": [["id"], ["projectId"]],
    "/projects/{project_id}/delete": [],
    "/projects/{project_id}/create_deployment": [["creator"], ["id"], ["projectId"]],
    "/deployments/{deployment_name}/delete": [],
    "/deployments/{deployment_name}/transfer": [],
    "/deployments/{deployment_name}/mint_ai_gateway_jwt": [],
    "/deployments/{deployment_name}/create_deploy_key": [],
    "/deployments/{deployment_name}/delete_deploy_key": [],
    "/projects/{project_id}/create_preview_deploy_key": [],
    "/projects/{project_id}/delete_preview_deploy_key": [],
    "/create_personal_access_token": [],
    "/delete_personal_access_token": [],
    "/teams/{team_id}/delete_access_token": [],
    "/deployments/{deployment_name}/create_custom_domain": [],
    "/deployments/{deployment_name}/delete_custom_domain": [],
    "/teams/create_team": [["creator"], ["id"], ["referredBy"]],
    "/teams/{team_id}/create_access_token": [],
    "/teams/{team_id}/invite_team_member": [],
    "/teams/{team_id}/cancel_team_member_invite": [],
    "/projects/{project_id}/update_default_environment_variables": [],
    "/teams/{team_id}/create_custom_role": [["creator"], ["id"], ["teamId"]],
    "/teams/{team_id}/update_custom_role": [["creator"], ["id"], ["teamId"]],
    "/teams/{team_id}/delete_custom_role": [],
    "/teams/{team_id}/update_team_member_role": [],
  },
};
