import { Client } from "@notionhq/client";
import type { QueryDatabaseParameters } from "@notionhq/client/build/src/api-endpoints";
import pThrottle from "p-throttle";
import { uuidFromID } from "./utils";


// import { assertNever } from '@notionhq/client/build/src/helpers'

const throttle = pThrottle({
  limit: 3,
  interval: 1000,
});

export const notion = new Client({
  auth: process.env.NOTION_KEY,
  notionVersion: '2022-02-22',
  // logLevel: LogLevel.DEBUG,
});

export const fetchAPI = (<T>() =>
  throttle(async function fetchAPI<T>(url: string): Promise<T | undefined> {
    let response;
    try {
      response = await fetch(`https://api.notion.com/v1${url}`, {
        headers: {
          Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
          "Notion-Version": "2022-02-22",
        },
      });
    } catch (error) {
      console.error(error);
    }
    if (response?.status !== 200) return;

    return response.json();
  }))();

const databaseId = process.env.NOTION_DATABASE_ID!;

export const getMainDatabase = throttle(async function getMainDatabase() {
  try {
    const response = await notion.databases.retrieve({
      database_id: databaseId,
    });

    return response;
  } catch (error) {
    console.error(error);

    // if (isNotionClientError(error)) {
    //   switch (error.code) {
    //     case ClientErrorCode.RequestTimeout:
    //       // ...
    //       break
    //     case APIErrorCode.ObjectNotFound:
    //       // ...
    //       break
    //     case APIErrorCode.Unauthorized:
    //       // ...
    //       break
    //     default:
    //       assertNever(error.code)
    //       break
    //   }
    // }
  }

  return;
});

export const getDatabase = throttle(async function getDatabase(params: {
  databaseId: string;
  pageSize?: number | null;
  filter?: QueryDatabaseParameters["filter"];
  sorts?: QueryDatabaseParameters["sorts"];
  cursor?: string | null;
}) {
  let response;
  try {
    response = await notion.databases.query({
      database_id: uuidFromID(params.databaseId),
      page_size: params.pageSize ?? 100,
      filter: params.filter,
      sorts: params.sorts,
      start_cursor: params.cursor || undefined,
    });
  } catch (error) {
    console.error(error);
  }
  return response;
});

export const getPage = throttle(async function getPage(pageId: string) {
  let response;
  try {
    response = await notion.pages.retrieve({ page_id: uuidFromID(pageId) });
  } catch (error) {
    console.error(error);
  }
  return response;
});

export async function getPageProperty<T>(
  pageId: string | null | undefined,
  propertyId: string | null | undefined
): Promise<T | undefined> {
  if (!pageId || !propertyId) return;

  let response;
  try {
    response = await fetchAPI(
      `/pages/${uuidFromID(pageId)}/properties/${propertyId}`
    );
  } catch (error) {
    console.error(error);
  }
  return response as T;
}

export const getBlocks = throttle(async function getBlocks(
  blockId: string,
  pageSize: number = 100
) {
  let response;
  try {
    response = await notion.blocks.children.list({
      block_id: uuidFromID(blockId),
      page_size: pageSize ?? 100,
    });
  } catch (error) {
    console.error(error);
  }
  return response?.results || [];
});
