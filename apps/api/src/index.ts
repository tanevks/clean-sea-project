import { env } from "./lib/env";
import { createServer } from "./server";

const app = createServer();

app.listen(env.API_PORT, env.API_HOST, () => {
  console.log(`API listening on http://${env.API_HOST}:${env.API_PORT}`);
});
