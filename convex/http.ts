// HTTP routes: only the sign-in endpoints of Convex Auth.
import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

export default http;
