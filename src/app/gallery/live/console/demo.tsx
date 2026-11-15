"use client";

import { useEffect, useState, type ReactNode } from "react";
import { HostLobby } from "@/components/live/HostLobby";
import { joinSimulated, type LiveHostTransport, type LiveSessionState } from "@/lib/live";
import { createInMemoryRoom, type InMemoryRoom } from "@/lib/live/memoryRoom";
import type { AnyResponse, Item } from "@/lib/ngn/schemas";
import type { ConsoleState } from "./states";

interface RoomEntry {
  item: Item;
  responses: AnyResponse[];
}

const CLASS = ["Ana Lima", "Ben Okafor", "Chen Wei", "Dana Ruiz"];
const CODE = "LEARN7";

interface Seeded {
  room: InMemoryRoom;
  host: LiveHostTransport;
  initial: LiveSessionState;
}

/**
 * Plays a short class into the room, then hands the console the room as it stands: four phones
 * joined, and on the question three of them answered with the fixture's own responses.
 */
async function seed(state: ConsoleState, set: readonly RoomEntry[]): Promise<Seeded> {
  const room = createInMemoryRoom({
    items: set.map((entry) => entry.item),
    code: CODE,
    sessionId: `console-${state}`,
  });
  const host = room.host();
  const phones = await joinSimulated(room, CLASS);
  if (state !== "lobby") {
    await host.setTimer(state === "question-untimed" ? null : 60);
    await host.start();
    const first = set[0];
    if (first) {
      for (const [index, phone] of phones.slice(0, 3).entries()) {
        const response = first.responses[index % first.responses.length];
        if (response !== undefined) await phone.transport.submit(first.item.id, response);
      }
    }
  }
  if (state === "ended") await host.end();
  if (state === "reconnecting") room.setHostConnection("reconnecting");
  const offline: LiveHostTransport = {
    ...host,
    // The channel never came up: the console opens from what the page read, and says so.
    open: () => Promise.reject(new Error("Not in the gallery.")),
  };
  return { room, host: state === "offline" ? offline : host, initial: room.currentState() };
}

export function ConsoleDemo({
  state,
  set,
  studentUrl,
  qrCode,
}: {
  state: ConsoleState;
  set: readonly RoomEntry[];
  studentUrl: string;
  qrCode: ReactNode;
}) {
  const [seeded, setSeeded] = useState<Seeded | null>(null);
  useEffect(() => {
    let live = true;
    void seed(state, set).then((value) => {
      if (live) setSeeded(value);
    });
    return () => {
      live = false;
    };
  }, [state, set]);

  return (
    <div data-testid="console-demo" data-ready={seeded !== null}>
      {seeded ? (
        <HostLobby
          sessionId={seeded.room.sessionId}
          title="Cardiac basics"
          code={CODE}
          studentUrl={studentUrl}
          qrCode={qrCode}
          initial={seeded.initial}
          connect={() => seeded.host}
        />
      ) : (
        <p className="p-8 text-ink-2">Setting up the room.</p>
      )}
    </div>
  );
}
