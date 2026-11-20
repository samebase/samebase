import { httpRouter } from "convex/server";
import { broker } from "./broker";

const http = httpRouter();
broker.addHttpRoutes(http);
// samebase.com's move to auth2.samebase.com reads its frozen grants here (`broker.ts`).
broker.addMigrationExportRoute(http);

export default http;
