import type { AnyProcedure } from "@trpc/server";
import type { TrpcItem } from "./items";
import { TrpcSync } from "./events";
import type { QueryProcedure } from "@trpc/server/unstable-core-do-not-import";

// TODO: In progress
export type SyncedRouter<TItem extends TrpcItem> = {
  list: QueryProcedure<{
    meta: unknown;
    input: void;
    output: TItem[];
  }>;
};

export const syncedRouter = <TParams, TItem extends TrpcItem>({
  procedure,
  list,
}: {
  procedure: {
    query: (queryFn: (params: TParams) => Promise<TItem[]>) => AnyProcedure;
  };
  list: (params: TParams & { sync: TrpcSync<TItem> }) => Promise<TItem[]>;
}) => {
  const routerSync = new TrpcSync<TItem>();

  return {
    list: procedure.query(async (params) => {
      const objects = await list({ ...params, sync: routerSync });
      return objects;
    }),
  };
};
