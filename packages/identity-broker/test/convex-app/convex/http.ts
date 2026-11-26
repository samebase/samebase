import { httpActionGeneric, httpRouter } from "convex/server";
import { broker } from "./broker.ts";

const http = httpRouter();
broker.addHttpRoutes(http);

// The broker sends at most one Set-Cookie field per response. This route sends two, so the test on
// a real backend sees whether an `httpAction` keeps both.
http.route({
  path: "/two-cookies",
  method: "GET",
  handler: httpActionGeneric(async () => {
    const response = new Response(null, { status: 204 });
    response.headers.append("Set-Cookie", "a=1; Path=/");
    response.headers.append("Set-Cookie", "b=2; Path=/");
    return response;
  }),
});

export default http;
