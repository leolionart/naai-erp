import { NaaiErpClient } from "./client.js";
import { sendJsonSubresourceRequest } from "./cli-http-helpers.js";

type Options = ConstructorParameters<typeof NaaiErpClient>[0];

/** CLI client that also exposes organization-scoped GET helpers used by count/summary actions. */
export class NaaiErpReadClient extends NaaiErpClient {
  constructor(
    private readonly readOptions: Options,
    private readonly readFetch: typeof fetch = fetch,
  ) {
    super(readOptions, readFetch);
  }

  getJson(path: string): Promise<unknown> {
    return sendJsonSubresourceRequest(this.readFetch, this.readOptions, path, "GET");
  }
}
