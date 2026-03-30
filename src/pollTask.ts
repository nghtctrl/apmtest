import Axios from "axios";
import { fromBase64 } from "./audioUtils";

/**
 * Poll a task URL until it returns HTTP 200, then decode the base-64
 * `data` property from the response into an audio Blob.
 */
export async function pollTask(url: string): Promise<Blob> {
  while (true) {
    const res = await Axios.get(url, { validateStatus: () => true });
    if (res.status === 200) {
      return fromBase64(res.data.data);
    }
    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
