import "reflect-metadata";
import { createApp } from "./bootstrap.js";

const port = Number.parseInt(process.env.PORT ?? "3001", 10);
const host = process.env.HOST ?? "0.0.0.0";
const app = await createApp();

await app.listen({ port, host });
