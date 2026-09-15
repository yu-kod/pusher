/**
 * Lambda のエントリポイント（HTTP API）。
 *
 * アプリの組み立ては createApp() に閉じてあるので、
 * ローカル起動（src/index.ts）と同じアプリをそのまま Lambda で動かす。
 */
import { handle } from "hono/aws-lambda";
import { createApp } from "./app.js";

export const handler = handle(createApp());
