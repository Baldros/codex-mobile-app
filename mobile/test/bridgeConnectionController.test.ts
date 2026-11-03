import type { BridgeClient } from "../src/api/bridgeClient";
import { BridgeConnectionController } from "../src/state/BridgeConnectionController";

afterEach(() => jest.useRealTimers());

test("retries an unreachable Bridge and announces restoration once", async () => {
  jest.useFakeTimers();
  const capabilities = jest.fn().mockRejectedValueOnce(new TypeError("network"))
    .mockResolvedValue({});
  const states: string[] = [];
  const restored = jest.fn();
  const controller = new BridgeConnectionController({ capabilities } as unknown as BridgeClient,
    (state) => states.push(state), restored);
  controller.start();
  await jest.advanceTimersByTimeAsync(0);
  expect(states).toEqual(["unreachable"]);
  await jest.advanceTimersByTimeAsync(2000);
  expect(states.at(-1)).toBe("connected");
  expect(restored).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(20000);
  expect(restored).toHaveBeenCalledTimes(1);
  controller.stop();
});

test("stopped controller cannot overwrite a new endpoint after a late response", async () => {
  jest.useFakeTimers();
  let resolve!: (value: unknown) => void;
  const capabilities = jest.fn().mockReturnValue(new Promise((done) => { resolve = done; }));
  const restored = jest.fn();
  const controller = new BridgeConnectionController({ capabilities } as unknown as BridgeClient,
    jest.fn(), restored);
  controller.start();
  await jest.advanceTimersByTimeAsync(0);
  controller.stop();
  resolve({});
  await Promise.resolve();
  expect(restored).not.toHaveBeenCalled();
});
