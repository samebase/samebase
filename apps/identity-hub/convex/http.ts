import { httpRouter } from "convex/server";
import { broker } from "./broker";
import { registerHubClient } from "./hubClients";
import { changeBlock, countRegistrations, listBlocks, listRegistrations } from "./moderation";

const http = httpRouter();
broker.addHttpRoutes(http);
http.route({ path: "/hub-clients", method: "POST", handler: registerHubClient });
// samebase.com's admin page, with HUB_MODERATION_KEY.
http.route({ path: "/moderation/registrations", method: "GET", handler: listRegistrations });
http.route({ path: "/moderation/counts", method: "GET", handler: countRegistrations });
http.route({ path: "/moderation/blocks", method: "GET", handler: listBlocks });
http.route({ path: "/moderation/blocks", method: "POST", handler: changeBlock });

export default http;
