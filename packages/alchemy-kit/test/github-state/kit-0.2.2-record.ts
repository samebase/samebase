// A record that @samebase/alchemy-kit 0.2.2 wrote: the ROW of GitHubState.test.ts at
// `owner/name/prod/Convex__Project.json`, its secret sealed under the key of 32 zero bytes.
export const KIT_0_2_2_PATH = "owner/name/prod/Convex__Project.json";
export const KIT_0_2_2_KEY = Buffer.alloc(32).toString("base64");
export const KIT_0_2_2_RECORD = `{
  "kind": "resource",
  "resourceType": "Convex.Project",
  "fqn": "Convex/Project",
  "logicalId": "Project",
  "instanceId": "instance-1",
  "providerVersion": 1,
  "status": "created",
  "downstream": [],
  "bindings": [],
  "props": {
    "name": "app",
    "nested": {
      "list": [
        1,
        {
          "deep": true
        }
      ]
    }
  },
  "attr": {
    "deployKey": {
      "__redacted__": {
        "__sealed__": "v1.QS3K20nSTlbgJ2rd.bEpXA2tyxvSQ4Y7vnT-5OQ2GBbhFJRqRQDXxQAB9HOM"
      }
    },
    "urls": {
      "cloud": "https://example.test"
    }
  }
}`;
