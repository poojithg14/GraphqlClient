# GraphQL CLNT

A full-featured GraphQL client extension for Visual Studio Code. Execute queries, manage collections, introspect schemas, and more — all without leaving your editor.

## Features

- **Query & Mutation Execution** — Send GraphQL operations with variables and custom headers
- **Collections & Folders** — Organize saved requests into collections, import/export as JSON
- **Schema Introspection** — Fetch and browse schemas with auto-generated operations from the field explorer
- **Schema Diff & Impact Analysis** — Compare schema versions and see which saved queries break
- **Auto-Heal Queries** — Automatically rename or remove fields broken by schema changes
- **Query Cost Estimation** — Predict query complexity based on field count, depth, and list multipliers
- **Security Analysis** — Detect depth attacks, alias abuse, sensitive fields, and missing pagination
- **Performance Tracking** — Track response times with anomaly detection
- **Natural Language to GraphQL** — Describe what you want in plain English and get a generated query
- **GraphQL Service Detection** — Auto-discover running GraphQL endpoints by scanning workspace ports

> **Note:** This is a GraphQL **client** only. You need a GraphQL server running locally or remotely to connect to. Point the extension at your server's endpoint URL to get started.

## Getting Started

1. Install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=PoojithGavini.graphql-clnt) or search **"GraphQL CLNT"** in VS Code
2. Open the **GraphQL CLNT** panel from the Activity Bar
3. Enter your endpoint URL and any required headers
4. Write your query and click **Execute**

## Contributors

**Poojith Gavini** — [GitHub](https://github.com/poojithg14) (author)

Thanks to **Ganesh Pinjala** and **Dinesh Bukya** for their contributions.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE)
