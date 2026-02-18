import { defineConfig } from "vite";

const githubRepository = process.env.GITHUB_REPOSITORY || "";
const repositoryName = githubRepository.split("/")[1] || "JSplayground";
const githubPagesBasePath = `/${repositoryName}/`;
const basePath =
  process.env.BASE_PATH ||
  (process.env.GITHUB_ACTIONS === "true" ? githubPagesBasePath : "/");

export default defineConfig({
  base: basePath,
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
