import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";

export async function createApp(): Promise<NestFastifyApplication> {
  return NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: process.env.NODE_ENV === "test" ? false : ["error", "warn", "log"],
  });
}
