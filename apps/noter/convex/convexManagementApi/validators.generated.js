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
      description: "Deprecated alias for `id`, kept for backwards compatibility.",
    },
    slug: {
      $ref: "#/components/schemas/ProjectSlug",
      description: "The shortened version of the project name used in Convex Dashboard URLs.",
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
    if (data.deploymentName !== undefined) {
      let data0 = data.deploymentName;
      if (typeof data0 !== "string" && data0 !== null) {
        const err3 = {
          instancePath: instancePath + "/deploymentName",
          schemaPath: "#/properties/deploymentName/type",
          keyword: "type",
          params: { type: schema2.properties.deploymentName.type },
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
          params: { type: schema2.properties.deploymentUrl.type },
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
      if (typeof data2 === "string") {
        if (!pattern0.test(data2)) {
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
    if (data.projectId !== undefined) {
      let data3 = data.projectId;
      if (typeof data3 === "string") {
        if (!pattern0.test(data3)) {
          const err7 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/pattern",
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
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
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
  props: { deploymentName: true, deploymentUrl: true, id: true, projectId: true, slug: true },
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
  props: { deploymentName: true, deploymentUrl: true, id: true, projectId: true, slug: true },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvListProjectsResponse = validate4;
const schema6 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1list_projects/get/responses/200/content/application~1json/schema",
};
const schema7 = { type: "array", items: { $ref: "#/components/schemas/PlatformProjectDetails" } };
const schema8 = {
  type: "object",
  required: ["id", "name", "slug", "teamId", "teamSlug", "createTime"],
  properties: {
    createTime: { type: "integer", format: "int64", description: "Timestamp in milliseconds." },
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
  },
};
const schema10 = { type: "string" };
const schema12 = { pattern: "^[0-9]+$", type: "string" };
const schema13 = { type: "string" };
function validate6(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate6.evaluated;
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
      if (typeof data1 === "string") {
        if (!pattern0.test(data1)) {
          const err7 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/ProjectId/pattern",
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
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/ProjectId/type",
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
      if (typeof data4 === "string") {
        if (!pattern0.test(data4)) {
          const err11 = {
            instancePath: instancePath + "/teamId",
            schemaPath: "#/components/schemas/TeamId/pattern",
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
          instancePath: instancePath + "/teamId",
          schemaPath: "#/components/schemas/TeamId/type",
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
  validate6.errors = vErrors;
  return errors === 0;
}
validate6.evaluated = {
  props: { createTime: true, id: true, name: true, slug: true, teamId: true, teamSlug: true },
  dynamicProps: false,
  dynamicItems: false,
};
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
  if (Array.isArray(data)) {
    const len0 = data.length;
    for (let i0 = 0; i0 < len0; i0++) {
      if (
        !validate6(data[i0], {
          instancePath: instancePath + "/" + i0,
          parentData: data,
          parentDataProperty: i0,
          rootData,
          dynamicAnchors,
        })
      ) {
        vErrors = vErrors === null ? validate6.errors : vErrors.concat(validate6.errors);
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
  validate5.errors = vErrors;
  return errors === 0;
}
validate5.evaluated = { items: true, dynamicProps: false, dynamicItems: false };
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
validate4.evaluated = { items: true, dynamicProps: false, dynamicItems: false };
export const ajvListDeploymentsResponse = validate9;
const schema14 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1projects~1{project_id}~1list_deployments/get/responses/200/content/application~1json/schema",
};
const schema15 = {
  type: "array",
  items: { $ref: "#/components/schemas/PlatformDeploymentResponse" },
};
const schema16 = {
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
        class: { type: "string", description: "The deployment class for this deployment." },
        createTime: {
          type: "integer",
          format: "int64",
          description: "Timestamp in milliseconds when this deployment was created.",
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
          description: "Timestamp in milliseconds of the last deploy to this deployment, if\nany.",
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
              description: "Preview deployment identifier, if this is a preview deployment.",
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
          description: "Timestamp in milliseconds when this deployment was created.",
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
          description: "The device name where this local deployment is running.",
        },
        isActive: {
          type: "boolean",
          description: "Whether this local deployment is currently active.",
        },
        kind: { type: "string", enum: ["local"] },
        name: { type: "string", description: "The readable identifier for this deployment." },
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
const schema17 = { pattern: "^[0-9]+$", type: "string" };
const schema18 = { type: "string", enum: ["dev", "prod", "preview", "custom"] };
const schema19 = { pattern: "^[0-9]+$", type: "string" };
const schema20 = {
  type: "boolean",
  description:
    "Indicates whether the deployment is the default prod deployment for the\nproject, or the default cloud dev deployment for the member in the project.",
};
const schema21 = { type: "string" };
const schema23 = {
  type: "string",
  description: "An identifier that uniquely identifies this deployment within the project.",
};
const schema24 = { type: "string", enum: ["aws-us-east-1", "aws-eu-west-1"] };
const schema27 = { type: "string" };
function validate11(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
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
      if (typeof data2 === "string") {
        if (!pattern0.test(data2)) {
          const err14 = {
            instancePath: instancePath + "/creator",
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
          instancePath: instancePath + "/creator",
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
          params: { type: schema16.oneOf[0].properties.dashboardEditConfirmation.type },
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
      if (!(data4 === "dev" || data4 === "prod" || data4 === "preview" || data4 === "custom")) {
        const err19 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/enum",
          keyword: "enum",
          params: { allowedValues: schema18.enum },
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
      if (!(typeof data6 == "number" && !(data6 % 1) && !isNaN(data6)) && data6 !== null) {
        const err21 = {
          instancePath: instancePath + "/expiresAt",
          schemaPath: "#/oneOf/0/properties/expiresAt/type",
          keyword: "type",
          params: { type: schema16.oneOf[0].properties.expiresAt.type },
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
      if (typeof data7 === "string") {
        if (!pattern0.test(data7)) {
          const err22 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/DeploymentId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
      } else {
        const err23 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/DeploymentId/type",
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
          params: { allowedValues: schema16.oneOf[0].properties.kind.enum },
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
      if (!(typeof data10 == "number" && !(data10 % 1) && !isNaN(data10)) && data10 !== null) {
        const err27 = {
          instancePath: instancePath + "/lastDeployTime",
          schemaPath: "#/oneOf/0/properties/lastDeployTime/type",
          keyword: "type",
          params: { type: schema16.oneOf[0].properties.lastDeployTime.type },
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
      if (typeof data13 === "string") {
        if (!pattern0.test(data13)) {
          const err32 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err32];
          } else {
            vErrors.push(err32);
          }
          errors++;
        }
      } else {
        const err33 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err33];
        } else {
          vErrors.push(err33);
        }
        errors++;
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
          params: { allowedValues: schema24.enum },
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
          params: { type: schema16.oneOf[0].properties.sendLogsToClient.type },
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
      if (typeof data18 === "string") {
        if (!pattern0.test(data18)) {
          const err49 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err49];
          } else {
            vErrors.push(err49);
          }
          errors++;
        }
      } else {
        const err50 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
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
      if (!(data19 === "dev" || data19 === "prod" || data19 === "preview" || data19 === "custom")) {
        const err52 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/enum",
          keyword: "enum",
          params: { allowedValues: schema18.enum },
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
          params: { allowedValues: schema16.oneOf[1].properties.kind.enum },
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
      if (typeof data26 === "string") {
        if (!pattern0.test(data26)) {
          const err63 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err63];
          } else {
            vErrors.push(err63);
          }
          errors++;
        }
      } else {
        const err64 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
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
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
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
  if (Array.isArray(data)) {
    const len0 = data.length;
    for (let i0 = 0; i0 < len0; i0++) {
      if (
        !validate11(data[i0], {
          instancePath: instancePath + "/" + i0,
          parentData: data,
          parentDataProperty: i0,
          rootData,
          dynamicAnchors,
        })
      ) {
        vErrors = vErrors === null ? validate11.errors : vErrors.concat(validate11.errors);
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
  validate10.errors = vErrors;
  return errors === 0;
}
validate10.evaluated = { items: true, dynamicProps: false, dynamicItems: false };
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
  if (
    !validate10(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate10.errors : vErrors.concat(validate10.errors);
    errors = vErrors.length;
  }
  validate9.errors = vErrors;
  return errors === 0;
}
validate9.evaluated = { items: true, dynamicProps: false, dynamicItems: false };
export const ajvGetDeploymentInProjectByProjectIdResponse = validate14;
const schema30 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1projects~1{project_id}~1deployment/get/responses/200/content/application~1json/schema",
};
function validate15(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate15.evaluated;
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
      if (typeof data2 === "string") {
        if (!pattern0.test(data2)) {
          const err14 = {
            instancePath: instancePath + "/creator",
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
          instancePath: instancePath + "/creator",
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
          params: { type: schema16.oneOf[0].properties.dashboardEditConfirmation.type },
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
      if (!(data4 === "dev" || data4 === "prod" || data4 === "preview" || data4 === "custom")) {
        const err19 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/enum",
          keyword: "enum",
          params: { allowedValues: schema18.enum },
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
      if (!(typeof data6 == "number" && !(data6 % 1) && !isNaN(data6)) && data6 !== null) {
        const err21 = {
          instancePath: instancePath + "/expiresAt",
          schemaPath: "#/oneOf/0/properties/expiresAt/type",
          keyword: "type",
          params: { type: schema16.oneOf[0].properties.expiresAt.type },
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
      if (typeof data7 === "string") {
        if (!pattern0.test(data7)) {
          const err22 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/DeploymentId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
      } else {
        const err23 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/DeploymentId/type",
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
          params: { allowedValues: schema16.oneOf[0].properties.kind.enum },
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
      if (!(typeof data10 == "number" && !(data10 % 1) && !isNaN(data10)) && data10 !== null) {
        const err27 = {
          instancePath: instancePath + "/lastDeployTime",
          schemaPath: "#/oneOf/0/properties/lastDeployTime/type",
          keyword: "type",
          params: { type: schema16.oneOf[0].properties.lastDeployTime.type },
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
      if (typeof data13 === "string") {
        if (!pattern0.test(data13)) {
          const err32 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err32];
          } else {
            vErrors.push(err32);
          }
          errors++;
        }
      } else {
        const err33 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err33];
        } else {
          vErrors.push(err33);
        }
        errors++;
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
          params: { allowedValues: schema24.enum },
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
          params: { type: schema16.oneOf[0].properties.sendLogsToClient.type },
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
      if (typeof data18 === "string") {
        if (!pattern0.test(data18)) {
          const err49 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err49];
          } else {
            vErrors.push(err49);
          }
          errors++;
        }
      } else {
        const err50 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
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
      if (!(data19 === "dev" || data19 === "prod" || data19 === "preview" || data19 === "custom")) {
        const err52 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/enum",
          keyword: "enum",
          params: { allowedValues: schema18.enum },
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
          params: { allowedValues: schema16.oneOf[1].properties.kind.enum },
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
      if (typeof data26 === "string") {
        if (!pattern0.test(data26)) {
          const err63 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err63];
          } else {
            vErrors.push(err63);
          }
          errors++;
        }
      } else {
        const err64 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
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
  validate15.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate15.evaluated = { dynamicProps: true, dynamicItems: false };
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
  if (
    !validate15(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate15.errors : vErrors.concat(validate15.errors);
    errors = vErrors.length;
  } else {
    var props0 = validate15.evaluated.props;
  }
  validate14.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate14.evaluated = { dynamicProps: true, dynamicItems: false };
export const ajvGetDeploymentInProjectByProjectSlugResponse = validate17;
const schema45 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id_or_slug}~1projects~1{project_slug}~1deployment/get/responses/200/content/application~1json/schema",
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
      if (typeof data2 === "string") {
        if (!pattern0.test(data2)) {
          const err14 = {
            instancePath: instancePath + "/creator",
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
          instancePath: instancePath + "/creator",
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
          params: { type: schema16.oneOf[0].properties.dashboardEditConfirmation.type },
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
      if (!(data4 === "dev" || data4 === "prod" || data4 === "preview" || data4 === "custom")) {
        const err19 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/enum",
          keyword: "enum",
          params: { allowedValues: schema18.enum },
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
      if (!(typeof data6 == "number" && !(data6 % 1) && !isNaN(data6)) && data6 !== null) {
        const err21 = {
          instancePath: instancePath + "/expiresAt",
          schemaPath: "#/oneOf/0/properties/expiresAt/type",
          keyword: "type",
          params: { type: schema16.oneOf[0].properties.expiresAt.type },
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
      if (typeof data7 === "string") {
        if (!pattern0.test(data7)) {
          const err22 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/DeploymentId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
      } else {
        const err23 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/DeploymentId/type",
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
          params: { allowedValues: schema16.oneOf[0].properties.kind.enum },
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
      if (!(typeof data10 == "number" && !(data10 % 1) && !isNaN(data10)) && data10 !== null) {
        const err27 = {
          instancePath: instancePath + "/lastDeployTime",
          schemaPath: "#/oneOf/0/properties/lastDeployTime/type",
          keyword: "type",
          params: { type: schema16.oneOf[0].properties.lastDeployTime.type },
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
      if (typeof data13 === "string") {
        if (!pattern0.test(data13)) {
          const err32 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err32];
          } else {
            vErrors.push(err32);
          }
          errors++;
        }
      } else {
        const err33 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err33];
        } else {
          vErrors.push(err33);
        }
        errors++;
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
          params: { allowedValues: schema24.enum },
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
          params: { type: schema16.oneOf[0].properties.sendLogsToClient.type },
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
      if (typeof data18 === "string") {
        if (!pattern0.test(data18)) {
          const err49 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err49];
          } else {
            vErrors.push(err49);
          }
          errors++;
        }
      } else {
        const err50 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
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
      if (!(data19 === "dev" || data19 === "prod" || data19 === "preview" || data19 === "custom")) {
        const err52 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/enum",
          keyword: "enum",
          params: { allowedValues: schema18.enum },
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
          params: { allowedValues: schema16.oneOf[1].properties.kind.enum },
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
      if (typeof data26 === "string") {
        if (!pattern0.test(data26)) {
          const err63 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err63];
          } else {
            vErrors.push(err63);
          }
          errors++;
        }
      } else {
        const err64 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
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
export const ajvGetProjectByIdResponse = validate20;
const schema60 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1projects~1{project_id}/get/responses/200/content/application~1json/schema",
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
      if (typeof data1 === "string") {
        if (!pattern0.test(data1)) {
          const err7 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/ProjectId/pattern",
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
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/ProjectId/type",
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
      if (typeof data4 === "string") {
        if (!pattern0.test(data4)) {
          const err11 = {
            instancePath: instancePath + "/teamId",
            schemaPath: "#/components/schemas/TeamId/pattern",
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
          instancePath: instancePath + "/teamId",
          schemaPath: "#/components/schemas/TeamId/type",
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
  validate21.errors = vErrors;
  return errors === 0;
}
validate21.evaluated = {
  props: { createTime: true, id: true, name: true, slug: true, teamId: true, teamSlug: true },
  dynamicProps: false,
  dynamicItems: false,
};
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
  }
  validate20.errors = vErrors;
  return errors === 0;
}
validate20.evaluated = {
  props: { createTime: true, id: true, name: true, slug: true, teamId: true, teamSlug: true },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvGetProjectBySlugResponse = validate23;
const schema67 = {
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
      if (typeof data1 === "string") {
        if (!pattern0.test(data1)) {
          const err7 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/ProjectId/pattern",
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
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/ProjectId/type",
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
      if (typeof data4 === "string") {
        if (!pattern0.test(data4)) {
          const err11 = {
            instancePath: instancePath + "/teamId",
            schemaPath: "#/components/schemas/TeamId/pattern",
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
          instancePath: instancePath + "/teamId",
          schemaPath: "#/components/schemas/TeamId/type",
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
  validate24.errors = vErrors;
  return errors === 0;
}
validate24.evaluated = {
  props: { createTime: true, id: true, name: true, slug: true, teamId: true, teamSlug: true },
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
  props: { createTime: true, id: true, name: true, slug: true, teamId: true, teamSlug: true },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvCreateDeploymentResponse = validate26;
const schema74 = {
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
      if (typeof data2 === "string") {
        if (!pattern0.test(data2)) {
          const err14 = {
            instancePath: instancePath + "/creator",
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
          instancePath: instancePath + "/creator",
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
          params: { type: schema16.oneOf[0].properties.dashboardEditConfirmation.type },
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
      if (!(data4 === "dev" || data4 === "prod" || data4 === "preview" || data4 === "custom")) {
        const err19 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/enum",
          keyword: "enum",
          params: { allowedValues: schema18.enum },
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
      if (!(typeof data6 == "number" && !(data6 % 1) && !isNaN(data6)) && data6 !== null) {
        const err21 = {
          instancePath: instancePath + "/expiresAt",
          schemaPath: "#/oneOf/0/properties/expiresAt/type",
          keyword: "type",
          params: { type: schema16.oneOf[0].properties.expiresAt.type },
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
      if (typeof data7 === "string") {
        if (!pattern0.test(data7)) {
          const err22 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/DeploymentId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
      } else {
        const err23 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/DeploymentId/type",
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
          params: { allowedValues: schema16.oneOf[0].properties.kind.enum },
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
      if (!(typeof data10 == "number" && !(data10 % 1) && !isNaN(data10)) && data10 !== null) {
        const err27 = {
          instancePath: instancePath + "/lastDeployTime",
          schemaPath: "#/oneOf/0/properties/lastDeployTime/type",
          keyword: "type",
          params: { type: schema16.oneOf[0].properties.lastDeployTime.type },
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
      if (typeof data13 === "string") {
        if (!pattern0.test(data13)) {
          const err32 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err32];
          } else {
            vErrors.push(err32);
          }
          errors++;
        }
      } else {
        const err33 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err33];
        } else {
          vErrors.push(err33);
        }
        errors++;
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
          params: { allowedValues: schema24.enum },
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
          params: { type: schema16.oneOf[0].properties.sendLogsToClient.type },
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
      if (typeof data18 === "string") {
        if (!pattern0.test(data18)) {
          const err49 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err49];
          } else {
            vErrors.push(err49);
          }
          errors++;
        }
      } else {
        const err50 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
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
      if (!(data19 === "dev" || data19 === "prod" || data19 === "preview" || data19 === "custom")) {
        const err52 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/enum",
          keyword: "enum",
          params: { allowedValues: schema18.enum },
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
          params: { allowedValues: schema16.oneOf[1].properties.kind.enum },
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
      if (typeof data26 === "string") {
        if (!pattern0.test(data26)) {
          const err63 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err63];
          } else {
            vErrors.push(err63);
          }
          errors++;
        }
      } else {
        const err64 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
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
const schema89 = {
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
      if (typeof data2 === "string") {
        if (!pattern0.test(data2)) {
          const err14 = {
            instancePath: instancePath + "/creator",
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
          instancePath: instancePath + "/creator",
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
          params: { type: schema16.oneOf[0].properties.dashboardEditConfirmation.type },
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
      if (!(data4 === "dev" || data4 === "prod" || data4 === "preview" || data4 === "custom")) {
        const err19 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/enum",
          keyword: "enum",
          params: { allowedValues: schema18.enum },
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
      if (!(typeof data6 == "number" && !(data6 % 1) && !isNaN(data6)) && data6 !== null) {
        const err21 = {
          instancePath: instancePath + "/expiresAt",
          schemaPath: "#/oneOf/0/properties/expiresAt/type",
          keyword: "type",
          params: { type: schema16.oneOf[0].properties.expiresAt.type },
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
      if (typeof data7 === "string") {
        if (!pattern0.test(data7)) {
          const err22 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/DeploymentId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
      } else {
        const err23 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/DeploymentId/type",
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
          params: { allowedValues: schema16.oneOf[0].properties.kind.enum },
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
      if (!(typeof data10 == "number" && !(data10 % 1) && !isNaN(data10)) && data10 !== null) {
        const err27 = {
          instancePath: instancePath + "/lastDeployTime",
          schemaPath: "#/oneOf/0/properties/lastDeployTime/type",
          keyword: "type",
          params: { type: schema16.oneOf[0].properties.lastDeployTime.type },
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
      if (typeof data13 === "string") {
        if (!pattern0.test(data13)) {
          const err32 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err32];
          } else {
            vErrors.push(err32);
          }
          errors++;
        }
      } else {
        const err33 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err33];
        } else {
          vErrors.push(err33);
        }
        errors++;
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
          params: { allowedValues: schema24.enum },
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
          params: { type: schema16.oneOf[0].properties.sendLogsToClient.type },
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
      if (typeof data18 === "string") {
        if (!pattern0.test(data18)) {
          const err49 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err49];
          } else {
            vErrors.push(err49);
          }
          errors++;
        }
      } else {
        const err50 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
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
      if (!(data19 === "dev" || data19 === "prod" || data19 === "preview" || data19 === "custom")) {
        const err52 = {
          instancePath: instancePath + "/deploymentType",
          schemaPath: "#/components/schemas/DeploymentType/enum",
          keyword: "enum",
          params: { allowedValues: schema18.enum },
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
          params: { allowedValues: schema16.oneOf[1].properties.kind.enum },
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
      if (typeof data26 === "string") {
        if (!pattern0.test(data26)) {
          const err63 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err63];
          } else {
            vErrors.push(err63);
          }
          errors++;
        }
      } else {
        const err64 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
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
const schema104 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1list_deployment_classes/get/responses/200/content/application~1json/schema",
};
const schema105 = {
  type: "object",
  required: ["items"],
  properties: {
    items: { type: "array", items: { $ref: "#/components/schemas/DeploymentClassMetadata" } },
  },
};
const schema106 = {
  type: "object",
  required: ["type", "available"],
  properties: {
    available: { type: "boolean" },
    type: { $ref: "#/components/schemas/DeploymentClass" },
  },
};
const schema107 = { type: "string", enum: ["s16", "s256", "d1024", "d2048"] };
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
    if (data.available !== undefined) {
      if (typeof data.available !== "boolean") {
        const err2 = {
          instancePath: instancePath + "/available",
          schemaPath: "#/properties/available/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.type !== undefined) {
      let data1 = data.type;
      if (typeof data1 !== "string") {
        const err3 = {
          instancePath: instancePath + "/type",
          schemaPath: "#/components/schemas/DeploymentClass/type",
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
      if (!(data1 === "s16" || data1 === "s256" || data1 === "d1024" || data1 === "d2048")) {
        const err4 = {
          instancePath: instancePath + "/type",
          schemaPath: "#/components/schemas/DeploymentClass/enum",
          keyword: "enum",
          params: { allowedValues: schema107.enum },
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
  props: { available: true, type: true },
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
const schema108 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1list_deployment_regions/get/responses/200/content/application~1json/schema",
};
const schema109 = {
  type: "object",
  required: ["items"],
  properties: {
    items: { type: "array", items: { $ref: "#/components/schemas/DeploymentRegionMetadata" } },
  },
};
const schema110 = {
  type: "object",
  required: ["name", "displayName", "available"],
  properties: {
    available: { type: "boolean" },
    displayName: { type: "string" },
    name: { $ref: "#/components/schemas/RegionName" },
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
    if (data.available !== undefined) {
      if (typeof data.available !== "boolean") {
        const err3 = {
          instancePath: instancePath + "/available",
          schemaPath: "#/properties/available/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
        };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.displayName !== undefined) {
      if (typeof data.displayName !== "string") {
        const err4 = {
          instancePath: instancePath + "/displayName",
          schemaPath: "#/properties/displayName/type",
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
      let data2 = data.name;
      if (typeof data2 !== "string") {
        const err5 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/components/schemas/RegionName/type",
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
      if (!(data2 === "aws-us-east-1" || data2 === "aws-eu-west-1")) {
        const err6 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/components/schemas/RegionName/enum",
          keyword: "enum",
          params: { allowedValues: schema24.enum },
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
  props: { available: true, displayName: true, name: true },
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
const schema112 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1list_deployments/get/responses/200/content/application~1json/schema",
};
const schema113 = {
  type: "object",
  required: ["items", "pagination"],
  properties: {
    items: { type: "array", items: { $ref: "#/components/schemas/PlatformDeploymentResponse" } },
    pagination: { $ref: "#/components/schemas/PaginationMetadata" },
  },
};
const schema114 = {
  type: "object",
  required: ["hasMore"],
  properties: { hasMore: { type: "boolean" }, nextCursor: { type: ["string", "null"] } },
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
            !validate11(data0[i0], {
              instancePath: instancePath + "/items/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate11.errors : vErrors.concat(validate11.errors);
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
              params: { type: schema114.properties.nextCursor.type },
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
const schema115 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1list_local_deployments/get/responses/200/content/application~1json/schema",
};
const schema116 = {
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
            !validate11(data0[i0], {
              instancePath: instancePath + "/items/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate11.errors : vErrors.concat(validate11.errors);
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
export const ajvCreateDeployKeyResponse = validate50;
const schema117 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1deployments~1{deployment_name}~1create_deploy_key/post/responses/200/content/application~1json/schema",
};
const schema118 = {
  type: "object",
  required: ["deployKey"],
  properties: {
    deployKey: { $ref: "#/components/schemas/AdminKey", description: "The generated deploy key." },
  },
};
const schema119 = { type: "string", description: "Encrypted admin key" };
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
  validate51.errors = vErrors;
  return errors === 0;
}
validate51.evaluated = { props: { deployKey: true }, dynamicProps: false, dynamicItems: false };
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
  if (
    !validate51(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate51.errors : vErrors.concat(validate51.errors);
    errors = vErrors.length;
  }
  validate50.errors = vErrors;
  return errors === 0;
}
validate50.evaluated = { props: { deployKey: true }, dynamicProps: false, dynamicItems: false };
export const ajvListDeployKeysResponse = validate53;
const schema120 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1deployments~1{deployment_name}~1list_deploy_keys/get/responses/200/content/application~1json/schema",
};
const schema121 = {
  type: "array",
  items: { $ref: "#/components/schemas/PlatformDeployKeyResponse" },
};
const schema122 = {
  type: "object",
  required: ["id", "name", "creationTime", "allowedActions"],
  properties: {
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
        ],
      },
    },
    creationTime: {
      type: "integer",
      format: "int64",
      description: "Timestamp in milliseconds when this token was created.",
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
    expiresAt: {
      type: ["integer", "null"],
      format: "int64",
      description: "Timestamp in milliseconds when this deploy key will expire.",
    },
    id: {
      $ref: "#/components/schemas/AccessTokenId",
      description: "Stable identifier for this deploy key.",
    },
    lastUsedTime: {
      type: ["integer", "null"],
      format: "int64",
      description: "Timestamp in milliseconds when this token was last used (if ever).",
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
    name: { type: "string", description: "The name given to the deploy key at creation." },
  },
};
const schema124 = { type: "integer", format: "int64", minimum: 0 };
const schema125 = {
  oneOf: [
    { type: "string", enum: ["vercel"] },
    { type: "object", required: ["oauthApp"], properties: { oauthApp: { type: "string" } } },
  ],
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
    if (data.allowedActions !== undefined) {
      let data0 = data.allowedActions;
      if (Array.isArray(data0)) {
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data1 = data0[i0];
          if (typeof data1 !== "string") {
            const err4 = {
              instancePath: instancePath + "/allowedActions/" + i0,
              schemaPath: "#/properties/allowedActions/items/type",
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
          if (
            !(
              data1 === "deployment:deploy" ||
              data1 === "deployment:env:view" ||
              data1 === "deployment:env:write" ||
              data1 === "deployment:pause" ||
              data1 === "deployment:unpause" ||
              data1 === "deployment:logs:view" ||
              data1 === "deployment:metrics:view" ||
              data1 === "deployment:integrations:view" ||
              data1 === "deployment:integrations:write" ||
              data1 === "deployment:data:view" ||
              data1 === "deployment:data:write" ||
              data1 === "deployment:backups:view" ||
              data1 === "deployment:backups:create" ||
              data1 === "deployment:backups:download" ||
              data1 === "deployment:backups:delete" ||
              data1 === "deployment:backups:import" ||
              data1 === "deployment:functions:actAsUser" ||
              data1 === "deployment:functions:runInternalQueries" ||
              data1 === "deployment:functions:runInternalMutations" ||
              data1 === "deployment:functions:runInternalActions" ||
              data1 === "deployment:functions:runTestQuery" ||
              data1 === "deployment:auditLog:view"
            )
          ) {
            const err5 = {
              instancePath: instancePath + "/allowedActions/" + i0,
              schemaPath: "#/properties/allowedActions/items/enum",
              keyword: "enum",
              params: { allowedValues: schema122.properties.allowedActions.items.enum },
              message: "must be equal to one of the allowed values",
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
          instancePath: instancePath + "/allowedActions",
          schemaPath: "#/properties/allowedActions/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
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
    if (data.creator !== undefined) {
      let data3 = data.creator;
      const _errs8 = errors;
      let valid3 = false;
      let passing0 = null;
      const _errs9 = errors;
      if (data3 !== null) {
        const err8 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/properties/creator/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
      var _valid0 = _errs9 === errors;
      if (_valid0) {
        valid3 = true;
        passing0 = 0;
      }
      const _errs11 = errors;
      if (typeof data3 === "string") {
        if (!pattern0.test(data3)) {
          const err9 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      } else {
        const err10 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
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
      var _valid0 = _errs11 === errors;
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
        const err11 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/properties/creator/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing0 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
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
    if (data.expiresAt !== undefined) {
      let data4 = data.expiresAt;
      if (!(typeof data4 == "number" && !(data4 % 1) && !isNaN(data4)) && data4 !== null) {
        const err12 = {
          instancePath: instancePath + "/expiresAt",
          schemaPath: "#/properties/expiresAt/type",
          keyword: "type",
          params: { type: schema122.properties.expiresAt.type },
          message: "must be integer,null",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      let data5 = data.id;
      if (!(typeof data5 == "number" && !(data5 % 1) && !isNaN(data5))) {
        const err13 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/AccessTokenId/type",
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
      if (typeof data5 == "number") {
        if (data5 < 0 || isNaN(data5)) {
          const err14 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/AccessTokenId/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
      }
    }
    if (data.lastUsedTime !== undefined) {
      let data6 = data.lastUsedTime;
      if (!(typeof data6 == "number" && !(data6 % 1) && !isNaN(data6)) && data6 !== null) {
        const err15 = {
          instancePath: instancePath + "/lastUsedTime",
          schemaPath: "#/properties/lastUsedTime/type",
          keyword: "type",
          params: { type: schema122.properties.lastUsedTime.type },
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
    if (data.managedBy !== undefined) {
      let data7 = data.managedBy;
      const _errs22 = errors;
      let valid6 = false;
      let passing1 = null;
      const _errs23 = errors;
      if (data7 !== null) {
        const err16 = {
          instancePath: instancePath + "/managedBy",
          schemaPath: "#/properties/managedBy/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
      var _valid1 = _errs23 === errors;
      if (_valid1) {
        valid6 = true;
        passing1 = 0;
      }
      const _errs25 = errors;
      const _errs27 = errors;
      let valid8 = false;
      let passing2 = null;
      const _errs28 = errors;
      if (typeof data7 !== "string") {
        const err17 = {
          instancePath: instancePath + "/managedBy",
          schemaPath: "#/components/schemas/ManagedBy/oneOf/0/type",
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
      if (!(data7 === "vercel")) {
        const err18 = {
          instancePath: instancePath + "/managedBy",
          schemaPath: "#/components/schemas/ManagedBy/oneOf/0/enum",
          keyword: "enum",
          params: { allowedValues: schema125.oneOf[0].enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
      var _valid2 = _errs28 === errors;
      if (_valid2) {
        valid8 = true;
        passing2 = 0;
      }
      const _errs30 = errors;
      if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
        if (data7.oauthApp === undefined) {
          const err19 = {
            instancePath: instancePath + "/managedBy",
            schemaPath: "#/components/schemas/ManagedBy/oneOf/1/required",
            keyword: "required",
            params: { missingProperty: "oauthApp" },
            message: "must have required property '" + "oauthApp" + "'",
          };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
        if (data7.oauthApp !== undefined) {
          if (typeof data7.oauthApp !== "string") {
            const err20 = {
              instancePath: instancePath + "/managedBy/oauthApp",
              schemaPath: "#/components/schemas/ManagedBy/oneOf/1/properties/oauthApp/type",
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
      } else {
        const err21 = {
          instancePath: instancePath + "/managedBy",
          schemaPath: "#/components/schemas/ManagedBy/oneOf/1/type",
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
      var _valid2 = _errs30 === errors;
      if (_valid2 && valid8) {
        valid8 = false;
        passing2 = [passing2, 1];
      } else {
        if (_valid2) {
          valid8 = true;
          passing2 = 1;
          var props0 = {};
          props0.oauthApp = true;
        }
      }
      if (!valid8) {
        const err22 = {
          instancePath: instancePath + "/managedBy",
          schemaPath: "#/components/schemas/ManagedBy/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing2 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      } else {
        errors = _errs27;
        if (vErrors !== null) {
          if (_errs27) {
            vErrors.length = _errs27;
          } else {
            vErrors = null;
          }
        }
      }
      var _valid1 = _errs25 === errors;
      if (_valid1 && valid6) {
        valid6 = false;
        passing1 = [passing1, 1];
      } else {
        if (_valid1) {
          valid6 = true;
          passing1 = 1;
        }
      }
      if (!valid6) {
        const err23 = {
          instancePath: instancePath + "/managedBy",
          schemaPath: "#/properties/managedBy/oneOf",
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
        errors = _errs22;
        if (vErrors !== null) {
          if (_errs22) {
            vErrors.length = _errs22;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err24 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/properties/name/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
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
  validate55.errors = vErrors;
  return errors === 0;
}
validate55.evaluated = {
  props: {
    allowedActions: true,
    creationTime: true,
    creator: true,
    expiresAt: true,
    id: true,
    lastUsedTime: true,
    managedBy: true,
    name: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
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
  if (Array.isArray(data)) {
    const len0 = data.length;
    for (let i0 = 0; i0 < len0; i0++) {
      if (
        !validate55(data[i0], {
          instancePath: instancePath + "/" + i0,
          parentData: data,
          parentDataProperty: i0,
          rootData,
          dynamicAnchors,
        })
      ) {
        vErrors = vErrors === null ? validate55.errors : vErrors.concat(validate55.errors);
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
  validate54.errors = vErrors;
  return errors === 0;
}
validate54.evaluated = { items: true, dynamicProps: false, dynamicItems: false };
function validate53(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate53.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate54(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate54.errors : vErrors.concat(validate54.errors);
    errors = vErrors.length;
  }
  validate53.errors = vErrors;
  return errors === 0;
}
validate53.evaluated = { items: true, dynamicProps: false, dynamicItems: false };
export const ajvCreatePreviewDeployKeyResponse = validate58;
const schema126 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1projects~1{project_id}~1create_preview_deploy_key/post/responses/200/content/application~1json/schema",
};
const schema127 = {
  type: "object",
  required: ["previewDeployKey"],
  properties: {
    previewDeployKey: {
      $ref: "#/components/schemas/AdminKey",
      description: "The generated preview deploy key.",
    },
  },
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
  validate59.errors = vErrors;
  return errors === 0;
}
validate59.evaluated = {
  props: { previewDeployKey: true },
  dynamicProps: false,
  dynamicItems: false,
};
function validate58(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate58.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate59(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate59.errors : vErrors.concat(validate59.errors);
    errors = vErrors.length;
  }
  validate58.errors = vErrors;
  return errors === 0;
}
validate58.evaluated = {
  props: { previewDeployKey: true },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvListPreviewDeployKeysResponse = validate61;
const schema129 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1projects~1{project_id}~1list_preview_deploy_keys/get/responses/200/content/application~1json/schema",
};
const schema130 = {
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
            !validate55(data0[i0], {
              instancePath: instancePath + "/items/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate55.errors : vErrors.concat(validate55.errors);
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
  validate62.errors = vErrors;
  return errors === 0;
}
validate62.evaluated = { props: { items: true }, dynamicProps: false, dynamicItems: false };
function validate61(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate61.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate62(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate62.errors : vErrors.concat(validate62.errors);
    errors = vErrors.length;
  }
  validate61.errors = vErrors;
  return errors === 0;
}
validate61.evaluated = { props: { items: true }, dynamicProps: false, dynamicItems: false };
export const ajvListPersonalAccessTokensResponse = validate65;
const schema131 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1list_personal_access_tokens/get/responses/200/content/application~1json/schema",
};
const schema132 = {
  type: "object",
  required: ["items", "pagination"],
  properties: {
    items: { type: "array", items: { $ref: "#/components/schemas/PersonalAccessTokenResponse" } },
    pagination: { $ref: "#/components/schemas/PaginationMetadata" },
  },
};
const schema133 = {
  type: "object",
  required: ["id", "name", "creationTime"],
  properties: {
    creationTime: { type: "integer", format: "int64" },
    expiresAt: { type: ["integer", "null"], format: "int64" },
    id: {
      $ref: "#/components/schemas/AccessTokenId",
      description: "Stable identifier for this access token.",
    },
    lastUsedTime: { type: ["integer", "null"], format: "int64" },
    name: { $ref: "#/components/schemas/DeviceName" },
    ssoTeamId: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/TeamId" }] },
  },
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
    if (data.creationTime !== undefined) {
      let data0 = data.creationTime;
      if (!(typeof data0 == "number" && !(data0 % 1) && !isNaN(data0))) {
        const err3 = {
          instancePath: instancePath + "/creationTime",
          schemaPath: "#/properties/creationTime/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.expiresAt !== undefined) {
      let data1 = data.expiresAt;
      if (!(typeof data1 == "number" && !(data1 % 1) && !isNaN(data1)) && data1 !== null) {
        const err4 = {
          instancePath: instancePath + "/expiresAt",
          schemaPath: "#/properties/expiresAt/type",
          keyword: "type",
          params: { type: schema133.properties.expiresAt.type },
          message: "must be integer,null",
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
          schemaPath: "#/components/schemas/AccessTokenId/type",
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
            schemaPath: "#/components/schemas/AccessTokenId/minimum",
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
    if (data.lastUsedTime !== undefined) {
      let data3 = data.lastUsedTime;
      if (!(typeof data3 == "number" && !(data3 % 1) && !isNaN(data3)) && data3 !== null) {
        const err7 = {
          instancePath: instancePath + "/lastUsedTime",
          schemaPath: "#/properties/lastUsedTime/type",
          keyword: "type",
          params: { type: schema133.properties.lastUsedTime.type },
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
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err8 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/components/schemas/DeviceName/type",
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
  validate67.errors = vErrors;
  return errors === 0;
}
validate67.evaluated = {
  props: {
    creationTime: true,
    expiresAt: true,
    id: true,
    lastUsedTime: true,
    name: true,
    ssoTeamId: true,
  },
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
            !validate67(data0[i0], {
              instancePath: instancePath + "/items/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate67.errors : vErrors.concat(validate67.errors);
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
              params: { type: schema114.properties.nextCursor.type },
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
  validate66.errors = vErrors;
  return errors === 0;
}
validate66.evaluated = {
  props: { items: true, pagination: true },
  dynamicProps: false,
  dynamicItems: false,
};
function validate65(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate65.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate66(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate66.errors : vErrors.concat(validate66.errors);
    errors = vErrors.length;
  }
  validate65.errors = vErrors;
  return errors === 0;
}
validate65.evaluated = {
  props: { items: true, pagination: true },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvCreatePersonalAccessTokenResponse = validate70;
const schema138 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1create_personal_access_token/post/responses/200/content/application~1json/schema",
};
const schema139 = {
  type: "object",
  required: ["accessToken"],
  properties: {
    accessToken: { type: "string", description: "The generated personal access token." },
  },
};
function validate70(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate70.evaluated;
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
  validate70.errors = vErrors;
  return errors === 0;
}
validate70.evaluated = { props: { accessToken: true }, dynamicProps: false, dynamicItems: false };
export const ajvListTeamAccessTokensResponse = validate71;
const schema140 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1list_access_tokens/get/responses/200/content/application~1json/schema",
};
const schema141 = {
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
const schema142 = {
  type: "object",
  required: ["id", "name", "creationTime"],
  properties: {
    creationTime: {
      type: "integer",
      format: "int64",
      description: "Timestamp in milliseconds when the token was created.",
    },
    creator: {
      oneOf: [
        { type: "null" },
        { $ref: "#/components/schemas/MemberId", description: "The member who created the token." },
      ],
    },
    expiresAt: {
      type: ["integer", "null"],
      format: "int64",
      description: "Timestamp in milliseconds when the token expires, if set.",
    },
    id: { $ref: "#/components/schemas/AccessTokenId", description: "The id of this access token." },
    lastUsedTime: {
      type: ["integer", "null"],
      format: "int64",
      description: "Timestamp in milliseconds when the token was last used, if ever.",
    },
    name: { type: "string", description: "Name of the token." },
  },
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
    if (data.creationTime !== undefined) {
      let data0 = data.creationTime;
      if (!(typeof data0 == "number" && !(data0 % 1) && !isNaN(data0))) {
        const err3 = {
          instancePath: instancePath + "/creationTime",
          schemaPath: "#/properties/creationTime/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.creator !== undefined) {
      let data1 = data.creator;
      const _errs4 = errors;
      let valid1 = false;
      let passing0 = null;
      const _errs5 = errors;
      if (data1 !== null) {
        const err4 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/properties/creator/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
      var _valid0 = _errs5 === errors;
      if (_valid0) {
        valid1 = true;
        passing0 = 0;
      }
      const _errs7 = errors;
      if (typeof data1 === "string") {
        if (!pattern0.test(data1)) {
          const err5 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
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
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
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
      var _valid0 = _errs7 === errors;
      if (_valid0 && valid1) {
        valid1 = false;
        passing0 = [passing0, 1];
      } else {
        if (_valid0) {
          valid1 = true;
          passing0 = 1;
        }
      }
      if (!valid1) {
        const err7 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/properties/creator/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing0 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      } else {
        errors = _errs4;
        if (vErrors !== null) {
          if (_errs4) {
            vErrors.length = _errs4;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.expiresAt !== undefined) {
      let data2 = data.expiresAt;
      if (!(typeof data2 == "number" && !(data2 % 1) && !isNaN(data2)) && data2 !== null) {
        const err8 = {
          instancePath: instancePath + "/expiresAt",
          schemaPath: "#/properties/expiresAt/type",
          keyword: "type",
          params: { type: schema142.properties.expiresAt.type },
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
    if (data.id !== undefined) {
      let data3 = data.id;
      if (!(typeof data3 == "number" && !(data3 % 1) && !isNaN(data3))) {
        const err9 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/AccessTokenId/type",
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
      if (typeof data3 == "number") {
        if (data3 < 0 || isNaN(data3)) {
          const err10 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/AccessTokenId/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      }
    }
    if (data.lastUsedTime !== undefined) {
      let data4 = data.lastUsedTime;
      if (!(typeof data4 == "number" && !(data4 % 1) && !isNaN(data4)) && data4 !== null) {
        const err11 = {
          instancePath: instancePath + "/lastUsedTime",
          schemaPath: "#/properties/lastUsedTime/type",
          keyword: "type",
          params: { type: schema142.properties.lastUsedTime.type },
          message: "must be integer,null",
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err12 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/properties/name/type",
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
  validate73.errors = vErrors;
  return errors === 0;
}
validate73.evaluated = {
  props: {
    creationTime: true,
    creator: true,
    expiresAt: true,
    id: true,
    lastUsedTime: true,
    name: true,
  },
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
            !validate73(data0[i0], {
              instancePath: instancePath + "/items/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate73.errors : vErrors.concat(validate73.errors);
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
              params: { type: schema114.properties.nextCursor.type },
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
  validate72.errors = vErrors;
  return errors === 0;
}
validate72.evaluated = {
  props: { items: true, pagination: true },
  dynamicProps: false,
  dynamicItems: false,
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
  if (
    !validate72(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate72.errors : vErrors.concat(validate72.errors);
    errors = vErrors.length;
  }
  validate71.errors = vErrors;
  return errors === 0;
}
validate71.evaluated = {
  props: { items: true, pagination: true },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvGetTokenDetailsResponse = validate76;
const schema146 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1token_details/get/responses/200/content/application~1json/schema",
};
const schema147 = {
  oneOf: [
    {
      type: "object",
      required: ["id", "teamId", "name", "createTime", "type"],
      properties: {
        createTime: {
          type: "integer",
          format: "int64",
          description: "Timestamp in milliseconds when this token was created.",
        },
        id: {
          $ref: "#/components/schemas/AccessTokenId",
          description: "Stable identifier for this access token.",
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
      required: ["id", "projectId", "name", "createTime", "type"],
      properties: {
        createTime: {
          type: "integer",
          format: "int64",
          description: "Timestamp in milliseconds when this token was created.",
        },
        id: {
          $ref: "#/components/schemas/AccessTokenId",
          description: "Stable identifier for this access token.",
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
    if (data.createTime !== undefined) {
      let data0 = data.createTime;
      if (!(typeof data0 == "number" && !(data0 % 1) && !isNaN(data0))) {
        const err5 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/oneOf/0/properties/createTime/type",
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
    }
    if (data.id !== undefined) {
      let data1 = data.id;
      if (!(typeof data1 == "number" && !(data1 % 1) && !isNaN(data1))) {
        const err6 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/AccessTokenId/type",
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
      if (typeof data1 == "number") {
        if (data1 < 0 || isNaN(data1)) {
          const err7 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/AccessTokenId/minimum",
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
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err8 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/components/schemas/DeviceName/type",
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
    if (data.teamId !== undefined) {
      let data3 = data.teamId;
      if (typeof data3 === "string") {
        if (!pattern0.test(data3)) {
          const err9 = {
            instancePath: instancePath + "/teamId",
            schemaPath: "#/components/schemas/TeamId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      } else {
        const err10 = {
          instancePath: instancePath + "/teamId",
          schemaPath: "#/components/schemas/TeamId/type",
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
          params: { allowedValues: schema147.oneOf[0].properties.type.enum },
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
    props0.createTime = true;
    props0.id = true;
    props0.name = true;
    props0.teamId = true;
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
    if (data.createTime !== undefined) {
      let data5 = data.createTime;
      if (!(typeof data5 == "number" && !(data5 % 1) && !isNaN(data5))) {
        const err19 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/oneOf/1/properties/createTime/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      let data6 = data.id;
      if (!(typeof data6 == "number" && !(data6 % 1) && !isNaN(data6))) {
        const err20 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/AccessTokenId/type",
          keyword: "type",
          params: { type: "integer" },
          message: "must be integer",
        };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
      if (typeof data6 == "number") {
        if (data6 < 0 || isNaN(data6)) {
          const err21 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/AccessTokenId/minimum",
            keyword: "minimum",
            params: { comparison: ">=", limit: 0 },
            message: "must be >= 0",
          };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      }
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err22 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/components/schemas/DeviceName/type",
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
    if (data.projectId !== undefined) {
      let data8 = data.projectId;
      if (typeof data8 === "string") {
        if (!pattern0.test(data8)) {
          const err23 = {
            instancePath: instancePath + "/projectId",
            schemaPath: "#/components/schemas/ProjectId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      } else {
        const err24 = {
          instancePath: instancePath + "/projectId",
          schemaPath: "#/components/schemas/ProjectId/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
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
          params: { allowedValues: schema147.oneOf[1].properties.type.enum },
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
        props0.createTime = true;
        props0.id = true;
        props0.name = true;
        props0.projectId = true;
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
  validate77.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate77.evaluated = { dynamicProps: true, dynamicItems: false };
function validate76(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate76.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate77(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate77.errors : vErrors.concat(validate77.errors);
    errors = vErrors.length;
  } else {
    var props0 = validate77.evaluated.props;
  }
  validate76.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate76.evaluated = { dynamicProps: true, dynamicItems: false };
export const ajvListCustomDomainsResponse = validate79;
const schema154 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1deployments~1{deployment_name}~1custom_domains/get/responses/200/content/application~1json/schema",
};
const schema155 = {
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
const schema156 = {
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
    domain: { type: "string", description: "The custom domain name." },
    requestDestination: {
      $ref: "#/components/schemas/RequestDestination",
      description: "The destination for this custom domain (convexCloud or convexSite).",
    },
    verificationTime: {
      type: ["integer", "null"],
      format: "int64",
      description:
        "Timestamp in milliseconds when this domain was verified, or null if not\nyet verified.",
    },
  },
};
const schema157 = { type: "string", enum: ["convexCloud", "convexSite"] };
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
    if (data.domain !== undefined) {
      if (typeof data.domain !== "string") {
        const err6 = {
          instancePath: instancePath + "/domain",
          schemaPath: "#/properties/domain/type",
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
    if (data.requestDestination !== undefined) {
      let data3 = data.requestDestination;
      if (typeof data3 !== "string") {
        const err7 = {
          instancePath: instancePath + "/requestDestination",
          schemaPath: "#/components/schemas/RequestDestination/type",
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
      if (!(data3 === "convexCloud" || data3 === "convexSite")) {
        const err8 = {
          instancePath: instancePath + "/requestDestination",
          schemaPath: "#/components/schemas/RequestDestination/enum",
          keyword: "enum",
          params: { allowedValues: schema157.enum },
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
    if (data.verificationTime !== undefined) {
      let data4 = data.verificationTime;
      if (!(typeof data4 == "number" && !(data4 % 1) && !isNaN(data4)) && data4 !== null) {
        const err9 = {
          instancePath: instancePath + "/verificationTime",
          schemaPath: "#/properties/verificationTime/type",
          keyword: "type",
          params: { type: schema156.properties.verificationTime.type },
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
  validate81.errors = vErrors;
  return errors === 0;
}
validate81.evaluated = {
  props: {
    creationTime: true,
    deploymentName: true,
    domain: true,
    requestDestination: true,
    verificationTime: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
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
            !validate81(data0[i0], {
              instancePath: instancePath + "/domains/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate81.errors : vErrors.concat(validate81.errors);
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
  validate80.errors = vErrors;
  return errors === 0;
}
validate80.evaluated = { props: { domains: true }, dynamicProps: false, dynamicItems: false };
function validate79(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate79.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate80(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate80.errors : vErrors.concat(validate80.errors);
    errors = vErrors.length;
  }
  validate79.errors = vErrors;
  return errors === 0;
}
validate79.evaluated = { props: { domains: true }, dynamicProps: false, dynamicItems: false };
export const ajvListTeamMembersResponse = validate84;
const schema158 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1list_members/get/responses/200/content/application~1json/schema",
};
const schema159 = {
  type: "object",
  required: ["items"],
  properties: { items: { type: "array", items: { $ref: "#/components/schemas/TeamMember" } } },
};
const schema160 = {
  type: "object",
  required: ["id", "email", "role"],
  properties: {
    customRoles: {
      type: ["array", "null"],
      items: { $ref: "#/components/schemas/TeamMemberCustomRole" },
      description:
        "The custom roles attached to this team member. Present iff\n`role` is `custom`.",
    },
    email: { type: "string", description: "The email of the team member" },
    id: { $ref: "#/components/schemas/MemberId" },
    name: { type: ["string", "null"], description: "The name of the team member" },
    role: {
      $ref: "#/components/schemas/Role",
      description:
        "The role of the team member. `custom` indicates the member's\npermissions come from the attached `customRoles`.",
    },
  },
};
const schema164 = { type: "string", enum: ["admin", "developer", "custom"] };
const schema161 = {
  type: "object",
  description:
    "A custom role attached to a team member, denormalized with the\nrole's display name so API consumers can render members without a\nseparate roles lookup.",
  required: ["id", "name"],
  properties: { id: { $ref: "#/components/schemas/CustomRoleId" }, name: { type: "string" } },
};
const schema162 = { pattern: "^[0-9]+$", type: "string" };
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
  validate87.errors = vErrors;
  return errors === 0;
}
validate87.evaluated = {
  props: { id: true, name: true },
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
    if (data.customRoles !== undefined) {
      let data0 = data.customRoles;
      if (!Array.isArray(data0) && data0 !== null) {
        const err3 = {
          instancePath: instancePath + "/customRoles",
          schemaPath: "#/properties/customRoles/type",
          keyword: "type",
          params: { type: schema160.properties.customRoles.type },
          message: "must be array,null",
        };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
      if (Array.isArray(data0)) {
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate87(data0[i0], {
              instancePath: instancePath + "/customRoles/" + i0,
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
      }
    }
    if (data.email !== undefined) {
      if (typeof data.email !== "string") {
        const err4 = {
          instancePath: instancePath + "/email",
          schemaPath: "#/properties/email/type",
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
      let data3 = data.id;
      if (typeof data3 === "string") {
        if (!pattern0.test(data3)) {
          const err5 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/MemberId/pattern",
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
          schemaPath: "#/components/schemas/MemberId/type",
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
      let data4 = data.name;
      if (typeof data4 !== "string" && data4 !== null) {
        const err7 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/properties/name/type",
          keyword: "type",
          params: { type: schema160.properties.name.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.role !== undefined) {
      let data5 = data.role;
      if (typeof data5 !== "string") {
        const err8 = {
          instancePath: instancePath + "/role",
          schemaPath: "#/components/schemas/Role/type",
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
      if (!(data5 === "admin" || data5 === "developer" || data5 === "custom")) {
        const err9 = {
          instancePath: instancePath + "/role",
          schemaPath: "#/components/schemas/Role/enum",
          keyword: "enum",
          params: { allowedValues: schema164.enum },
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
  validate86.errors = vErrors;
  return errors === 0;
}
validate86.evaluated = {
  props: { customRoles: true, email: true, id: true, name: true, role: true },
  dynamicProps: false,
  dynamicItems: false,
};
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
            !validate86(data0[i0], {
              instancePath: instancePath + "/items/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate86.errors : vErrors.concat(validate86.errors);
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
  validate85.errors = vErrors;
  return errors === 0;
}
validate85.evaluated = { props: { items: true }, dynamicProps: false, dynamicItems: false };
function validate84(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate84.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate85(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate85.errors : vErrors.concat(validate85.errors);
    errors = vErrors.length;
  }
  validate84.errors = vErrors;
  return errors === 0;
}
validate84.evaluated = { props: { items: true }, dynamicProps: false, dynamicItems: false };
export const ajvCreateTeamResponse = validate91;
const schema165 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1create_team/post/responses/201/content/application~1json/schema",
};
const schema166 = {
  type: "object",
  required: ["id", "name", "slug", "suspended", "referralCode"],
  properties: {
    creator: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/MemberId" }] },
    defaultRegion: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/RegionName" }] },
    id: { $ref: "#/components/schemas/TeamId" },
    managedBy: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/ManagedBy" }] },
    managedByUrl: { type: ["string", "null"] },
    name: { $ref: "#/components/schemas/TeamName" },
    referralCode: { $ref: "#/components/schemas/ReferralCode" },
    referredBy: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/TeamId" }] },
    slug: { $ref: "#/components/schemas/TeamSlug" },
    ssoLoginId: { type: ["string", "null"] },
    suspended: { type: "boolean" },
  },
};
const schema171 = { type: "string" };
const schema172 = { type: "string" };
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
    if (data.creator !== undefined) {
      let data0 = data.creator;
      const _errs2 = errors;
      let valid1 = false;
      let passing0 = null;
      const _errs3 = errors;
      if (data0 !== null) {
        const err5 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/properties/creator/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
      var _valid0 = _errs3 === errors;
      if (_valid0) {
        valid1 = true;
        passing0 = 0;
      }
      const _errs5 = errors;
      if (typeof data0 === "string") {
        if (!pattern0.test(data0)) {
          const err6 = {
            instancePath: instancePath + "/creator",
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
          instancePath: instancePath + "/creator",
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
      var _valid0 = _errs5 === errors;
      if (_valid0 && valid1) {
        valid1 = false;
        passing0 = [passing0, 1];
      } else {
        if (_valid0) {
          valid1 = true;
          passing0 = 1;
        }
      }
      if (!valid1) {
        const err8 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/properties/creator/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing0 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      } else {
        errors = _errs2;
        if (vErrors !== null) {
          if (_errs2) {
            vErrors.length = _errs2;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.defaultRegion !== undefined) {
      let data1 = data.defaultRegion;
      const _errs9 = errors;
      let valid3 = false;
      let passing1 = null;
      const _errs10 = errors;
      if (data1 !== null) {
        const err9 = {
          instancePath: instancePath + "/defaultRegion",
          schemaPath: "#/properties/defaultRegion/oneOf/0/type",
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
      var _valid1 = _errs10 === errors;
      if (_valid1) {
        valid3 = true;
        passing1 = 0;
      }
      const _errs12 = errors;
      if (typeof data1 !== "string") {
        const err10 = {
          instancePath: instancePath + "/defaultRegion",
          schemaPath: "#/components/schemas/RegionName/type",
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
      if (!(data1 === "aws-us-east-1" || data1 === "aws-eu-west-1")) {
        const err11 = {
          instancePath: instancePath + "/defaultRegion",
          schemaPath: "#/components/schemas/RegionName/enum",
          keyword: "enum",
          params: { allowedValues: schema24.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
      var _valid1 = _errs12 === errors;
      if (_valid1 && valid3) {
        valid3 = false;
        passing1 = [passing1, 1];
      } else {
        if (_valid1) {
          valid3 = true;
          passing1 = 1;
        }
      }
      if (!valid3) {
        const err12 = {
          instancePath: instancePath + "/defaultRegion",
          schemaPath: "#/properties/defaultRegion/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing1 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      } else {
        errors = _errs9;
        if (vErrors !== null) {
          if (_errs9) {
            vErrors.length = _errs9;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.id !== undefined) {
      let data2 = data.id;
      if (typeof data2 === "string") {
        if (!pattern0.test(data2)) {
          const err13 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/TeamId/pattern",
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
          instancePath: instancePath + "/id",
          schemaPath: "#/components/schemas/TeamId/type",
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
    if (data.managedBy !== undefined) {
      let data3 = data.managedBy;
      const _errs19 = errors;
      let valid6 = false;
      let passing2 = null;
      const _errs20 = errors;
      if (data3 !== null) {
        const err15 = {
          instancePath: instancePath + "/managedBy",
          schemaPath: "#/properties/managedBy/oneOf/0/type",
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
      var _valid2 = _errs20 === errors;
      if (_valid2) {
        valid6 = true;
        passing2 = 0;
      }
      const _errs22 = errors;
      const _errs24 = errors;
      let valid8 = false;
      let passing3 = null;
      const _errs25 = errors;
      if (typeof data3 !== "string") {
        const err16 = {
          instancePath: instancePath + "/managedBy",
          schemaPath: "#/components/schemas/ManagedBy/oneOf/0/type",
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
      if (!(data3 === "vercel")) {
        const err17 = {
          instancePath: instancePath + "/managedBy",
          schemaPath: "#/components/schemas/ManagedBy/oneOf/0/enum",
          keyword: "enum",
          params: { allowedValues: schema125.oneOf[0].enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
      var _valid3 = _errs25 === errors;
      if (_valid3) {
        valid8 = true;
        passing3 = 0;
      }
      const _errs27 = errors;
      if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
        if (data3.oauthApp === undefined) {
          const err18 = {
            instancePath: instancePath + "/managedBy",
            schemaPath: "#/components/schemas/ManagedBy/oneOf/1/required",
            keyword: "required",
            params: { missingProperty: "oauthApp" },
            message: "must have required property '" + "oauthApp" + "'",
          };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
        if (data3.oauthApp !== undefined) {
          if (typeof data3.oauthApp !== "string") {
            const err19 = {
              instancePath: instancePath + "/managedBy/oauthApp",
              schemaPath: "#/components/schemas/ManagedBy/oneOf/1/properties/oauthApp/type",
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
      } else {
        const err20 = {
          instancePath: instancePath + "/managedBy",
          schemaPath: "#/components/schemas/ManagedBy/oneOf/1/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
      var _valid3 = _errs27 === errors;
      if (_valid3 && valid8) {
        valid8 = false;
        passing3 = [passing3, 1];
      } else {
        if (_valid3) {
          valid8 = true;
          passing3 = 1;
          var props0 = {};
          props0.oauthApp = true;
        }
      }
      if (!valid8) {
        const err21 = {
          instancePath: instancePath + "/managedBy",
          schemaPath: "#/components/schemas/ManagedBy/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing3 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      } else {
        errors = _errs24;
        if (vErrors !== null) {
          if (_errs24) {
            vErrors.length = _errs24;
          } else {
            vErrors = null;
          }
        }
      }
      var _valid2 = _errs22 === errors;
      if (_valid2 && valid6) {
        valid6 = false;
        passing2 = [passing2, 1];
      } else {
        if (_valid2) {
          valid6 = true;
          passing2 = 1;
        }
      }
      if (!valid6) {
        const err22 = {
          instancePath: instancePath + "/managedBy",
          schemaPath: "#/properties/managedBy/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing2 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
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
    if (data.managedByUrl !== undefined) {
      let data5 = data.managedByUrl;
      if (typeof data5 !== "string" && data5 !== null) {
        const err23 = {
          instancePath: instancePath + "/managedByUrl",
          schemaPath: "#/properties/managedByUrl/type",
          keyword: "type",
          params: { type: schema166.properties.managedByUrl.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      }
    }
    if (data.name !== undefined) {
      if (typeof data.name !== "string") {
        const err24 = {
          instancePath: instancePath + "/name",
          schemaPath: "#/components/schemas/TeamName/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
    }
    if (data.referralCode !== undefined) {
      if (typeof data.referralCode !== "string") {
        const err25 = {
          instancePath: instancePath + "/referralCode",
          schemaPath: "#/components/schemas/ReferralCode/type",
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
    if (data.referredBy !== undefined) {
      let data8 = data.referredBy;
      const _errs40 = errors;
      let valid12 = false;
      let passing4 = null;
      const _errs41 = errors;
      if (data8 !== null) {
        const err26 = {
          instancePath: instancePath + "/referredBy",
          schemaPath: "#/properties/referredBy/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
        }
        errors++;
      }
      var _valid4 = _errs41 === errors;
      if (_valid4) {
        valid12 = true;
        passing4 = 0;
      }
      const _errs43 = errors;
      if (typeof data8 === "string") {
        if (!pattern0.test(data8)) {
          const err27 = {
            instancePath: instancePath + "/referredBy",
            schemaPath: "#/components/schemas/TeamId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
      } else {
        const err28 = {
          instancePath: instancePath + "/referredBy",
          schemaPath: "#/components/schemas/TeamId/type",
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
      var _valid4 = _errs43 === errors;
      if (_valid4 && valid12) {
        valid12 = false;
        passing4 = [passing4, 1];
      } else {
        if (_valid4) {
          valid12 = true;
          passing4 = 1;
        }
      }
      if (!valid12) {
        const err29 = {
          instancePath: instancePath + "/referredBy",
          schemaPath: "#/properties/referredBy/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing4 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err29];
        } else {
          vErrors.push(err29);
        }
        errors++;
      } else {
        errors = _errs40;
        if (vErrors !== null) {
          if (_errs40) {
            vErrors.length = _errs40;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.slug !== undefined) {
      if (typeof data.slug !== "string") {
        const err30 = {
          instancePath: instancePath + "/slug",
          schemaPath: "#/components/schemas/TeamSlug/type",
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
    if (data.ssoLoginId !== undefined) {
      let data10 = data.ssoLoginId;
      if (typeof data10 !== "string" && data10 !== null) {
        const err31 = {
          instancePath: instancePath + "/ssoLoginId",
          schemaPath: "#/properties/ssoLoginId/type",
          keyword: "type",
          params: { type: schema166.properties.ssoLoginId.type },
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
    if (data.suspended !== undefined) {
      if (typeof data.suspended !== "boolean") {
        const err32 = {
          instancePath: instancePath + "/suspended",
          schemaPath: "#/properties/suspended/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
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
  validate92.errors = vErrors;
  return errors === 0;
}
validate92.evaluated = {
  props: {
    creator: true,
    defaultRegion: true,
    id: true,
    managedBy: true,
    managedByUrl: true,
    name: true,
    referralCode: true,
    referredBy: true,
    slug: true,
    ssoLoginId: true,
    suspended: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
function validate91(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate91.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate92(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate92.errors : vErrors.concat(validate92.errors);
    errors = vErrors.length;
  }
  validate91.errors = vErrors;
  return errors === 0;
}
validate91.evaluated = {
  props: {
    creator: true,
    defaultRegion: true,
    id: true,
    managedBy: true,
    managedByUrl: true,
    name: true,
    referralCode: true,
    referredBy: true,
    slug: true,
    ssoLoginId: true,
    suspended: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvCreateTeamAccessTokenResponse = validate94;
const schema175 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1create_access_token/post/responses/201/content/application~1json/schema",
};
const schema176 = {
  type: "object",
  required: ["accessToken", "tokenType"],
  properties: { accessToken: { type: "string" }, tokenType: { type: "string" } },
};
function validate94(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate94.evaluated;
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
  validate94.errors = vErrors;
  return errors === 0;
}
validate94.evaluated = {
  props: { accessToken: true, tokenType: true },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvListAuditLogEventsResponse = validate95;
const schema177 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1list_audit_log_events/get/responses/200/content/application~1json/schema",
};
const schema178 = {
  type: "object",
  required: ["items", "pagination"],
  properties: {
    items: { type: "array", items: { $ref: "#/components/schemas/AuditLogEventResponse" } },
    pagination: { $ref: "#/components/schemas/PaginationMetadata" },
  },
};
const schema179 = {
  type: "object",
  required: ["teamId", "actor", "action", "createTime", "metadata"],
  properties: {
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
        "deployment:transfer",
        "deployment:receive",
        "deployment:update",
        "customRole:create",
        "customRole:update",
        "customRole:delete",
      ],
    },
    actor: {
      $ref: "#/components/schemas/AuditLogActor",
      description: "The identity that executed the action",
    },
    clientIp: {
      type: ["string", "null"],
      description: "IP address of the client that performed the action, if known.",
    },
    clientUserAgent: {
      type: ["string", "null"],
      description: "User agent of the client that performed the action, if known.",
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
    teamId: { $ref: "#/components/schemas/TeamId", description: "Team ID" },
  },
};
const schema184 = {};
const schema180 = {
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
        kind: { type: "string", enum: ["member"] },
        member_id: { $ref: "#/components/schemas/MemberId", description: "Member ID" },
      },
    },
    {
      type: "object",
      title: "Token",
      description: "A token.",
      required: ["token_id", "kind"],
      properties: {
        kind: { type: "string", enum: ["token"] },
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
      },
    },
    {
      type: "object",
      title: "OAuthApp",
      description: "An OAuth application.",
      required: ["client_id", "kind"],
      properties: {
        client_id: { type: "string", description: "Client ID of the OAuth application" },
        kind: { type: "string", enum: ["app"] },
      },
    },
  ],
  description: "The identity that executed an audit log action.",
};
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
          params: { allowedValues: schema180.oneOf[0].properties.kind.enum },
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
    if (data.kind !== undefined) {
      let data1 = data.kind;
      if (typeof data1 !== "string") {
        const err6 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/1/properties/kind/type",
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
      if (!(data1 === "member")) {
        const err7 = {
          instancePath: instancePath + "/kind",
          schemaPath: "#/oneOf/1/properties/kind/enum",
          keyword: "enum",
          params: { allowedValues: schema180.oneOf[1].properties.kind.enum },
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
    if (data.member_id !== undefined) {
      let data2 = data.member_id;
      if (typeof data2 === "string") {
        if (!pattern0.test(data2)) {
          const err8 = {
            instancePath: instancePath + "/member_id",
            schemaPath: "#/components/schemas/MemberId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      } else {
        const err9 = {
          instancePath: instancePath + "/member_id",
          schemaPath: "#/components/schemas/MemberId/type",
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
        props0.kind = true;
        props0.member_id = true;
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
      if (data.kind !== undefined) {
        let data3 = data.kind;
        if (typeof data3 !== "string") {
          const err13 = {
            instancePath: instancePath + "/kind",
            schemaPath: "#/oneOf/2/properties/kind/type",
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
        if (!(data3 === "token")) {
          const err14 = {
            instancePath: instancePath + "/kind",
            schemaPath: "#/oneOf/2/properties/kind/enum",
            keyword: "enum",
            params: { allowedValues: schema180.oneOf[2].properties.kind.enum },
            message: "must be equal to one of the allowed values",
          };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
      }
      if (data.member_id !== undefined) {
        let data4 = data.member_id;
        const _errs17 = errors;
        let valid5 = false;
        let passing1 = null;
        const _errs18 = errors;
        if (data4 !== null) {
          const err15 = {
            instancePath: instancePath + "/member_id",
            schemaPath: "#/oneOf/2/properties/member_id/oneOf/0/type",
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
        var _valid1 = _errs18 === errors;
        if (_valid1) {
          valid5 = true;
          passing1 = 0;
        }
        const _errs20 = errors;
        if (typeof data4 === "string") {
          if (!pattern0.test(data4)) {
            const err16 = {
              instancePath: instancePath + "/member_id",
              schemaPath: "#/components/schemas/MemberId/pattern",
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
            instancePath: instancePath + "/member_id",
            schemaPath: "#/components/schemas/MemberId/type",
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
        var _valid1 = _errs20 === errors;
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
          const err18 = {
            instancePath: instancePath + "/member_id",
            schemaPath: "#/oneOf/2/properties/member_id/oneOf",
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
          errors = _errs17;
          if (vErrors !== null) {
            if (_errs17) {
              vErrors.length = _errs17;
            } else {
              vErrors = null;
            }
          }
        }
      }
      if (data.token_id !== undefined) {
        let data5 = data.token_id;
        if (!(typeof data5 == "number" && !(data5 % 1) && !isNaN(data5))) {
          const err19 = {
            instancePath: instancePath + "/token_id",
            schemaPath: "#/components/schemas/AccessTokenId/type",
            keyword: "type",
            params: { type: "integer" },
            message: "must be integer",
          };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
        if (typeof data5 == "number") {
          if (data5 < 0 || isNaN(data5)) {
            const err20 = {
              instancePath: instancePath + "/token_id",
              schemaPath: "#/components/schemas/AccessTokenId/minimum",
              keyword: "minimum",
              params: { comparison: ">=", limit: 0 },
              message: "must be >= 0",
            };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
        }
      }
    } else {
      const err21 = {
        instancePath,
        schemaPath: "#/oneOf/2/type",
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
          props0.kind = true;
          props0.member_id = true;
          props0.token_id = true;
        }
      }
      const _errs26 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.client_id === undefined) {
          const err22 = {
            instancePath,
            schemaPath: "#/oneOf/3/required",
            keyword: "required",
            params: { missingProperty: "client_id" },
            message: "must have required property '" + "client_id" + "'",
          };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
        if (data.kind === undefined) {
          const err23 = {
            instancePath,
            schemaPath: "#/oneOf/3/required",
            keyword: "required",
            params: { missingProperty: "kind" },
            message: "must have required property '" + "kind" + "'",
          };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
        if (data.client_id !== undefined) {
          if (typeof data.client_id !== "string") {
            const err24 = {
              instancePath: instancePath + "/client_id",
              schemaPath: "#/oneOf/3/properties/client_id/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
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
          let data7 = data.kind;
          if (typeof data7 !== "string") {
            const err25 = {
              instancePath: instancePath + "/kind",
              schemaPath: "#/oneOf/3/properties/kind/type",
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
          if (!(data7 === "app")) {
            const err26 = {
              instancePath: instancePath + "/kind",
              schemaPath: "#/oneOf/3/properties/kind/enum",
              keyword: "enum",
              params: { allowedValues: schema180.oneOf[3].properties.kind.enum },
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
          schemaPath: "#/oneOf/3/type",
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
      var _valid0 = _errs26 === errors;
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
  validate98.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate98.evaluated = { dynamicProps: true, dynamicItems: false };
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
    if (data.action !== undefined) {
      let data0 = data.action;
      if (typeof data0 !== "string") {
        const err5 = {
          instancePath: instancePath + "/action",
          schemaPath: "#/properties/action/type",
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
      if (
        !(
          data0 === "team:join" ||
          data0 === "team:create" ||
          data0 === "team:update" ||
          data0 === "team:delete" ||
          data0 === "project:create" ||
          data0 === "project:transfer" ||
          data0 === "project:receive" ||
          data0 === "project:update" ||
          data0 === "project:delete" ||
          data0 === "defaultEnvironmentVariable:create" ||
          data0 === "defaultEnvironmentVariable:update" ||
          data0 === "defaultEnvironmentVariable:delete" ||
          data0 === "deployment:create" ||
          data0 === "deployment:delete" ||
          data0 === "member:invite" ||
          data0 === "member:cancelInvitation" ||
          data0 === "member:remove" ||
          data0 === "member:updateRole" ||
          data0 === "project:updateMemberRole" ||
          data0 === "billing:paymentMethod:update" ||
          data0 === "billing:contact:update" ||
          data0 === "billing:address:update" ||
          data0 === "billing:subscription:create" ||
          data0 === "billing:subscription:resume" ||
          data0 === "billing:subscription:cancel" ||
          data0 === "billing:subscription:changePlan" ||
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
          data0 === "deployment:customDomain:create" ||
          data0 === "deployment:customDomain:delete" ||
          data0 === "deployment:backups:create" ||
          data0 === "deployment:backups:import" ||
          data0 === "deployment:backups:configurePeriodic" ||
          data0 === "deployment:backups:disablePeriodic" ||
          data0 === "deployment:backups:delete" ||
          data0 === "team:disableExceedingSpendingLimits" ||
          data0 === "billing:spendingLimit:update" ||
          data0 === "team:applyReferralCode" ||
          data0 === "oauthApplication:create" ||
          data0 === "oauthApplication:update" ||
          data0 === "oauthApplication:delete" ||
          data0 === "oauthApplication:verify" ||
          data0 === "oauthApplication:generateClientSecret" ||
          data0 === "integration:workos:team:create" ||
          data0 === "integration:workos:environment:create" ||
          data0 === "integration:workos:environment:delete" ||
          data0 === "integration:workos:environment:retrieveCredentials" ||
          data0 === "integration:workos:team:disconnect" ||
          data0 === "integration:workos:team:inviteMember" ||
          data0 === "integration:workos:projectEnvironment:create" ||
          data0 === "integration:workos:projectEnvironment:delete" ||
          data0 === "integration:workos:projectEnvironment:retrieveCredentials" ||
          data0 === "sso:enable" ||
          data0 === "sso:disable" ||
          data0 === "sso:update" ||
          data0 === "deployment:transfer" ||
          data0 === "deployment:receive" ||
          data0 === "deployment:update" ||
          data0 === "customRole:create" ||
          data0 === "customRole:update" ||
          data0 === "customRole:delete"
        )
      ) {
        const err6 = {
          instancePath: instancePath + "/action",
          schemaPath: "#/properties/action/enum",
          keyword: "enum",
          params: { allowedValues: schema179.properties.action.enum },
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
    if (data.actor !== undefined) {
      if (
        !validate98(data.actor, {
          instancePath: instancePath + "/actor",
          parentData: data,
          parentDataProperty: "actor",
          rootData,
          dynamicAnchors,
        })
      ) {
        vErrors = vErrors === null ? validate98.errors : vErrors.concat(validate98.errors);
        errors = vErrors.length;
      }
    }
    if (data.clientIp !== undefined) {
      let data2 = data.clientIp;
      if (typeof data2 !== "string" && data2 !== null) {
        const err7 = {
          instancePath: instancePath + "/clientIp",
          schemaPath: "#/properties/clientIp/type",
          keyword: "type",
          params: { type: schema179.properties.clientIp.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.clientUserAgent !== undefined) {
      let data3 = data.clientUserAgent;
      if (typeof data3 !== "string" && data3 !== null) {
        const err8 = {
          instancePath: instancePath + "/clientUserAgent",
          schemaPath: "#/properties/clientUserAgent/type",
          keyword: "type",
          params: { type: schema179.properties.clientUserAgent.type },
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
    if (data.createTime !== undefined) {
      let data4 = data.createTime;
      if (!(typeof data4 == "number" && !(data4 % 1) && !isNaN(data4))) {
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
    if (data.teamId !== undefined) {
      let data6 = data.teamId;
      if (typeof data6 === "string") {
        if (!pattern0.test(data6)) {
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
  validate97.errors = vErrors;
  return errors === 0;
}
validate97.evaluated = {
  props: {
    action: true,
    actor: true,
    clientIp: true,
    clientUserAgent: true,
    createTime: true,
    metadata: true,
    teamId: true,
  },
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
            !validate97(data0[i0], {
              instancePath: instancePath + "/items/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate97.errors : vErrors.concat(validate97.errors);
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
              params: { type: schema114.properties.nextCursor.type },
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
  validate96.errors = vErrors;
  return errors === 0;
}
validate96.evaluated = {
  props: { items: true, pagination: true },
  dynamicProps: false,
  dynamicItems: false,
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
  if (
    !validate96(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate96.errors : vErrors.concat(validate96.errors);
    errors = vErrors.length;
  }
  validate95.errors = vErrors;
  return errors === 0;
}
validate95.evaluated = {
  props: { items: true, pagination: true },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvListPendingTeamInvitesResponse = validate102;
const schema187 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1list_pending_invites/get/responses/200/content/application~1json/schema",
};
const schema188 = {
  type: "object",
  required: ["items"],
  properties: {
    items: { type: "array", items: { $ref: "#/components/schemas/InvitationResponse" } },
  },
};
const schema189 = {
  type: "object",
  required: ["email", "expired", "role"],
  properties: {
    customRoles: {
      type: ["array", "null"],
      items: { $ref: "#/components/schemas/TeamMemberCustomRole" },
      description: "The custom roles attached to this invitation. Present iff `role` is\n`custom`.",
    },
    email: { type: "string" },
    expired: { type: "boolean" },
    role: { $ref: "#/components/schemas/Role" },
  },
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
    if (data.customRoles !== undefined) {
      let data0 = data.customRoles;
      if (!Array.isArray(data0) && data0 !== null) {
        const err3 = {
          instancePath: instancePath + "/customRoles",
          schemaPath: "#/properties/customRoles/type",
          keyword: "type",
          params: { type: schema189.properties.customRoles.type },
          message: "must be array,null",
        };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
      if (Array.isArray(data0)) {
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate87(data0[i0], {
              instancePath: instancePath + "/customRoles/" + i0,
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
      }
    }
    if (data.email !== undefined) {
      if (typeof data.email !== "string") {
        const err4 = {
          instancePath: instancePath + "/email",
          schemaPath: "#/properties/email/type",
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
    if (data.expired !== undefined) {
      if (typeof data.expired !== "boolean") {
        const err5 = {
          instancePath: instancePath + "/expired",
          schemaPath: "#/properties/expired/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
        };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.role !== undefined) {
      let data4 = data.role;
      if (typeof data4 !== "string") {
        const err6 = {
          instancePath: instancePath + "/role",
          schemaPath: "#/components/schemas/Role/type",
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
      if (!(data4 === "admin" || data4 === "developer" || data4 === "custom")) {
        const err7 = {
          instancePath: instancePath + "/role",
          schemaPath: "#/components/schemas/Role/enum",
          keyword: "enum",
          params: { allowedValues: schema164.enum },
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
  validate104.errors = vErrors;
  return errors === 0;
}
validate104.evaluated = {
  props: { customRoles: true, email: true, expired: true, role: true },
  dynamicProps: false,
  dynamicItems: false,
};
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
            !validate104(data0[i0], {
              instancePath: instancePath + "/items/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate104.errors : vErrors.concat(validate104.errors);
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
  validate103.errors = vErrors;
  return errors === 0;
}
validate103.evaluated = { props: { items: true }, dynamicProps: false, dynamicItems: false };
function validate102(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate102.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate103(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate103.errors : vErrors.concat(validate103.errors);
    errors = vErrors.length;
  }
  validate102.errors = vErrors;
  return errors === 0;
}
validate102.evaluated = { props: { items: true }, dynamicProps: false, dynamicItems: false };
export const ajvListDefaultEnvironmentVariablesResponse = validate108;
const schema191 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1projects~1{project_id}~1list_default_environment_variables/get/responses/200/content/application~1json/schema",
};
const schema192 = {
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
const schema193 = {
  type: "object",
  required: ["name", "value", "deploymentTypes"],
  properties: {
    deploymentTypes: {
      type: "array",
      items: { $ref: "#/components/schemas/DeploymentType" },
      description:
        "The deployment types that this env var name + value apply to.\nNote that when filtering by a particular deployment type,\nall items in the result will have a single element\nin `deploymentType`.",
    },
    name: { type: "string" },
    value: { type: "string" },
  },
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
    if (data.deploymentTypes !== undefined) {
      let data0 = data.deploymentTypes;
      if (Array.isArray(data0)) {
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data1 = data0[i0];
          if (typeof data1 !== "string") {
            const err3 = {
              instancePath: instancePath + "/deploymentTypes/" + i0,
              schemaPath: "#/components/schemas/DeploymentType/type",
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
          if (!(data1 === "dev" || data1 === "prod" || data1 === "preview" || data1 === "custom")) {
            const err4 = {
              instancePath: instancePath + "/deploymentTypes/" + i0,
              schemaPath: "#/components/schemas/DeploymentType/enum",
              keyword: "enum",
              params: { allowedValues: schema18.enum },
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
      } else {
        const err5 = {
          instancePath: instancePath + "/deploymentTypes",
          schemaPath: "#/properties/deploymentTypes/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
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
    if (data.value !== undefined) {
      if (typeof data.value !== "string") {
        const err7 = {
          instancePath: instancePath + "/value",
          schemaPath: "#/properties/value/type",
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
  validate110.errors = vErrors;
  return errors === 0;
}
validate110.evaluated = {
  props: { deploymentTypes: true, name: true, value: true },
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
            !validate110(data0[i0], {
              instancePath: instancePath + "/items/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate110.errors : vErrors.concat(validate110.errors);
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
              params: { type: schema114.properties.nextCursor.type },
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
  validate109.errors = vErrors;
  return errors === 0;
}
validate109.evaluated = {
  props: { items: true, pagination: true },
  dynamicProps: false,
  dynamicItems: false,
};
function validate108(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate108.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate109(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate109.errors : vErrors.concat(validate109.errors);
    errors = vErrors.length;
  }
  validate108.errors = vErrors;
  return errors === 0;
}
validate108.evaluated = {
  props: { items: true, pagination: true },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvCreateCustomRoleResponse = validate113;
const schema196 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1create_custom_role/post/responses/201/content/application~1json/schema",
};
const schema197 = {
  type: "object",
  required: ["id", "teamId", "name", "statements", "createTime"],
  properties: {
    createTime: { type: "integer", format: "int64" },
    creator: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/MemberId" }] },
    description: { type: ["string", "null"] },
    id: { $ref: "#/components/schemas/CustomRoleId" },
    name: { type: "string" },
    statements: { type: "array", items: { $ref: "#/components/schemas/RoleStatement" } },
    teamId: { $ref: "#/components/schemas/TeamId" },
  },
};
const schema200 = {
  type: "object",
  description: "A single permission rule within a custom role.",
  required: ["effect", "actions", "resource"],
  properties: {
    actions: { $ref: "#/components/schemas/RoleStatementActions" },
    effect: { $ref: "#/components/schemas/RoleStatementEffect" },
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
const schema201 = {
  oneOf: [
    { $ref: "#/components/schemas/RoleStatementWildcardAction" },
    { type: "array", items: { $ref: "#/components/schemas/RoleStatementAction" } },
  ],
};
const schema202 = { type: "string", enum: ["*"] };
const schema203 = {
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
  ],
};
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
      params: { allowedValues: schema202.enum },
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
          data0 === "deployment:auditLog:view"
        )
      ) {
        const err3 = {
          instancePath: instancePath + "/" + i0,
          schemaPath: "#/components/schemas/RoleStatementAction/enum",
          keyword: "enum",
          params: { allowedValues: schema203.enum },
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
  validate116.errors = vErrors;
  evaluated0.items = items0;
  return errors === 0;
}
validate116.evaluated = { dynamicProps: false, dynamicItems: true };
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
    if (data.actions !== undefined) {
      if (
        !validate116(data.actions, {
          instancePath: instancePath + "/actions",
          parentData: data,
          parentDataProperty: "actions",
          rootData,
          dynamicAnchors,
        })
      ) {
        vErrors = vErrors === null ? validate116.errors : vErrors.concat(validate116.errors);
        errors = vErrors.length;
      }
    }
    if (data.effect !== undefined) {
      let data1 = data.effect;
      if (typeof data1 !== "string") {
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
      if (!(data1 === "allow" || data1 === "deny")) {
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
  validate115.errors = vErrors;
  return errors === 0;
}
validate115.evaluated = {
  props: { actions: true, effect: true, resource: true },
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
    if (data.createTime !== undefined) {
      let data0 = data.createTime;
      if (!(typeof data0 == "number" && !(data0 % 1) && !isNaN(data0))) {
        const err5 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/properties/createTime/type",
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
    }
    if (data.creator !== undefined) {
      let data1 = data.creator;
      const _errs4 = errors;
      let valid1 = false;
      let passing0 = null;
      const _errs5 = errors;
      if (data1 !== null) {
        const err6 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/properties/creator/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
      var _valid0 = _errs5 === errors;
      if (_valid0) {
        valid1 = true;
        passing0 = 0;
      }
      const _errs7 = errors;
      if (typeof data1 === "string") {
        if (!pattern0.test(data1)) {
          const err7 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
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
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
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
      var _valid0 = _errs7 === errors;
      if (_valid0 && valid1) {
        valid1 = false;
        passing0 = [passing0, 1];
      } else {
        if (_valid0) {
          valid1 = true;
          passing0 = 1;
        }
      }
      if (!valid1) {
        const err9 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/properties/creator/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing0 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      } else {
        errors = _errs4;
        if (vErrors !== null) {
          if (_errs4) {
            vErrors.length = _errs4;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.description !== undefined) {
      let data2 = data.description;
      if (typeof data2 !== "string" && data2 !== null) {
        const err10 = {
          instancePath: instancePath + "/description",
          schemaPath: "#/properties/description/type",
          keyword: "type",
          params: { type: schema197.properties.description.type },
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
    if (data.id !== undefined) {
      let data3 = data.id;
      if (typeof data3 === "string") {
        if (!pattern0.test(data3)) {
          const err11 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/CustomRoleId/pattern",
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
          schemaPath: "#/components/schemas/CustomRoleId/type",
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
          schemaPath: "#/properties/name/type",
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
    if (data.statements !== undefined) {
      let data5 = data.statements;
      if (Array.isArray(data5)) {
        const len0 = data5.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate115(data5[i0], {
              instancePath: instancePath + "/statements/" + i0,
              parentData: data5,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate115.errors : vErrors.concat(validate115.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err14 = {
          instancePath: instancePath + "/statements",
          schemaPath: "#/properties/statements/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.teamId !== undefined) {
      let data7 = data.teamId;
      if (typeof data7 === "string") {
        if (!pattern0.test(data7)) {
          const err15 = {
            instancePath: instancePath + "/teamId",
            schemaPath: "#/components/schemas/TeamId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
      } else {
        const err16 = {
          instancePath: instancePath + "/teamId",
          schemaPath: "#/components/schemas/TeamId/type",
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
  validate114.errors = vErrors;
  return errors === 0;
}
validate114.evaluated = {
  props: {
    createTime: true,
    creator: true,
    description: true,
    id: true,
    name: true,
    statements: true,
    teamId: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
function validate113(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate113.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate114(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate114.errors : vErrors.concat(validate114.errors);
    errors = vErrors.length;
  }
  validate113.errors = vErrors;
  return errors === 0;
}
validate113.evaluated = {
  props: {
    createTime: true,
    creator: true,
    description: true,
    id: true,
    name: true,
    statements: true,
    teamId: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvListCustomRolesResponse = validate120;
const schema206 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1list_custom_roles/get/responses/200/content/application~1json/schema",
};
const schema207 = {
  type: "object",
  required: ["items", "pagination"],
  properties: {
    items: { type: "array", items: { $ref: "#/components/schemas/CustomRoleResponse" } },
    pagination: { $ref: "#/components/schemas/PaginationMetadata" },
  },
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
    if (data.createTime !== undefined) {
      let data0 = data.createTime;
      if (!(typeof data0 == "number" && !(data0 % 1) && !isNaN(data0))) {
        const err5 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/properties/createTime/type",
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
    }
    if (data.creator !== undefined) {
      let data1 = data.creator;
      const _errs4 = errors;
      let valid1 = false;
      let passing0 = null;
      const _errs5 = errors;
      if (data1 !== null) {
        const err6 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/properties/creator/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
      var _valid0 = _errs5 === errors;
      if (_valid0) {
        valid1 = true;
        passing0 = 0;
      }
      const _errs7 = errors;
      if (typeof data1 === "string") {
        if (!pattern0.test(data1)) {
          const err7 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
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
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
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
      var _valid0 = _errs7 === errors;
      if (_valid0 && valid1) {
        valid1 = false;
        passing0 = [passing0, 1];
      } else {
        if (_valid0) {
          valid1 = true;
          passing0 = 1;
        }
      }
      if (!valid1) {
        const err9 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/properties/creator/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing0 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      } else {
        errors = _errs4;
        if (vErrors !== null) {
          if (_errs4) {
            vErrors.length = _errs4;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.description !== undefined) {
      let data2 = data.description;
      if (typeof data2 !== "string" && data2 !== null) {
        const err10 = {
          instancePath: instancePath + "/description",
          schemaPath: "#/properties/description/type",
          keyword: "type",
          params: { type: schema197.properties.description.type },
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
    if (data.id !== undefined) {
      let data3 = data.id;
      if (typeof data3 === "string") {
        if (!pattern0.test(data3)) {
          const err11 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/CustomRoleId/pattern",
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
          schemaPath: "#/components/schemas/CustomRoleId/type",
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
          schemaPath: "#/properties/name/type",
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
    if (data.statements !== undefined) {
      let data5 = data.statements;
      if (Array.isArray(data5)) {
        const len0 = data5.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate115(data5[i0], {
              instancePath: instancePath + "/statements/" + i0,
              parentData: data5,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate115.errors : vErrors.concat(validate115.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err14 = {
          instancePath: instancePath + "/statements",
          schemaPath: "#/properties/statements/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.teamId !== undefined) {
      let data7 = data.teamId;
      if (typeof data7 === "string") {
        if (!pattern0.test(data7)) {
          const err15 = {
            instancePath: instancePath + "/teamId",
            schemaPath: "#/components/schemas/TeamId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
      } else {
        const err16 = {
          instancePath: instancePath + "/teamId",
          schemaPath: "#/components/schemas/TeamId/type",
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
  validate122.errors = vErrors;
  return errors === 0;
}
validate122.evaluated = {
  props: {
    createTime: true,
    creator: true,
    description: true,
    id: true,
    name: true,
    statements: true,
    teamId: true,
  },
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
            !validate122(data0[i0], {
              instancePath: instancePath + "/items/" + i0,
              parentData: data0,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate122.errors : vErrors.concat(validate122.errors);
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
              params: { type: schema114.properties.nextCursor.type },
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
  validate121.errors = vErrors;
  return errors === 0;
}
validate121.evaluated = {
  props: { items: true, pagination: true },
  dynamicProps: false,
  dynamicItems: false,
};
function validate120(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate120.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate121(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate121.errors : vErrors.concat(validate121.errors);
    errors = vErrors.length;
  }
  validate120.errors = vErrors;
  return errors === 0;
}
validate120.evaluated = {
  props: { items: true, pagination: true },
  dynamicProps: false,
  dynamicItems: false,
};
export const ajvUpdateCustomRoleResponse = validate126;
const schema213 = {
  $ref: "https://api.convex.dev/v1/openapi.json#/paths/~1teams~1{team_id}~1update_custom_role/post/responses/200/content/application~1json/schema",
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
    if (data.createTime !== undefined) {
      let data0 = data.createTime;
      if (!(typeof data0 == "number" && !(data0 % 1) && !isNaN(data0))) {
        const err5 = {
          instancePath: instancePath + "/createTime",
          schemaPath: "#/properties/createTime/type",
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
    }
    if (data.creator !== undefined) {
      let data1 = data.creator;
      const _errs4 = errors;
      let valid1 = false;
      let passing0 = null;
      const _errs5 = errors;
      if (data1 !== null) {
        const err6 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/properties/creator/oneOf/0/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
      var _valid0 = _errs5 === errors;
      if (_valid0) {
        valid1 = true;
        passing0 = 0;
      }
      const _errs7 = errors;
      if (typeof data1 === "string") {
        if (!pattern0.test(data1)) {
          const err7 = {
            instancePath: instancePath + "/creator",
            schemaPath: "#/components/schemas/MemberId/pattern",
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
          instancePath: instancePath + "/creator",
          schemaPath: "#/components/schemas/MemberId/type",
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
      var _valid0 = _errs7 === errors;
      if (_valid0 && valid1) {
        valid1 = false;
        passing0 = [passing0, 1];
      } else {
        if (_valid0) {
          valid1 = true;
          passing0 = 1;
        }
      }
      if (!valid1) {
        const err9 = {
          instancePath: instancePath + "/creator",
          schemaPath: "#/properties/creator/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing0 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      } else {
        errors = _errs4;
        if (vErrors !== null) {
          if (_errs4) {
            vErrors.length = _errs4;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.description !== undefined) {
      let data2 = data.description;
      if (typeof data2 !== "string" && data2 !== null) {
        const err10 = {
          instancePath: instancePath + "/description",
          schemaPath: "#/properties/description/type",
          keyword: "type",
          params: { type: schema197.properties.description.type },
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
    if (data.id !== undefined) {
      let data3 = data.id;
      if (typeof data3 === "string") {
        if (!pattern0.test(data3)) {
          const err11 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/components/schemas/CustomRoleId/pattern",
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
          schemaPath: "#/components/schemas/CustomRoleId/type",
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
          schemaPath: "#/properties/name/type",
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
    if (data.statements !== undefined) {
      let data5 = data.statements;
      if (Array.isArray(data5)) {
        const len0 = data5.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate115(data5[i0], {
              instancePath: instancePath + "/statements/" + i0,
              parentData: data5,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate115.errors : vErrors.concat(validate115.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err14 = {
          instancePath: instancePath + "/statements",
          schemaPath: "#/properties/statements/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.teamId !== undefined) {
      let data7 = data.teamId;
      if (typeof data7 === "string") {
        if (!pattern0.test(data7)) {
          const err15 = {
            instancePath: instancePath + "/teamId",
            schemaPath: "#/components/schemas/TeamId/pattern",
            keyword: "pattern",
            params: { pattern: "^[0-9]+$" },
            message: 'must match pattern "' + "^[0-9]+$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
      } else {
        const err16 = {
          instancePath: instancePath + "/teamId",
          schemaPath: "#/components/schemas/TeamId/type",
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
  validate127.errors = vErrors;
  return errors === 0;
}
validate127.evaluated = {
  props: {
    createTime: true,
    creator: true,
    description: true,
    id: true,
    name: true,
    statements: true,
    teamId: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
function validate126(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate126.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (
    !validate127(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })
  ) {
    vErrors = vErrors === null ? validate127.errors : vErrors.concat(validate127.errors);
    errors = vErrors.length;
  }
  validate126.errors = vErrors;
  return errors === 0;
}
validate126.evaluated = {
  props: {
    createTime: true,
    creator: true,
    description: true,
    id: true,
    name: true,
    statements: true,
    teamId: true,
  },
  dynamicProps: false,
  dynamicItems: false,
};
export const convexManagementResponseValidators = {
  GET: {
    "/teams/{team_id}/list_projects": ajvListProjectsResponse,
    "/projects/{project_id}/list_deployments": ajvListDeploymentsResponse,
    "/projects/{project_id}/deployment": ajvGetDeploymentInProjectByProjectIdResponse,
    "/teams/{team_id_or_slug}/projects/{project_slug}/deployment":
      ajvGetDeploymentInProjectByProjectSlugResponse,
    "/projects/{project_id}": ajvGetProjectByIdResponse,
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
