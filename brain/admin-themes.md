152691802326

https://admin.shopify.com/api/app_proxy/junaid-workspace?operation=ThemeDeleteLegacy&version=unstable

{ "operationName": "ThemeDeleteLegacy", "variables": { "id":
"gid://shopify/OnlineStoreTheme/154492764374" }, "query": "mutation
ThemeDeleteLegacy($id: ID!) {\n onlineStoreThemeDelete(id: $id) {\n
deletedThemeId\n userErrors {\n field\n message\n **typename\n }\n **typename\n
}\n}\n" }

const serverData =
JSON.parse(document.querySelector('script[data-serialized-id="server-data"]').textContent);
const csrfToken = serverData.csrfToken;

fetch("https://admin.shopify.com/api/app_proxy/junaid-workspace?operation=ThemeDeleteLegacy&version=unstable",
{ method: "POST", credentials: "include", headers: { "accept":
"application/json", "content-type": "application/json", "x-csrf-token":
csrfToken, }, body: JSON.stringify({ operationName: "ThemeDeleteLegacy",
variables: { id: "gid://shopify/OnlineStoreTheme/154095517910" }, query:
`mutation ThemeDeleteLegacy($id: ID!) {     onlineStoreThemeDelete(id: $id) {       deletedThemeId       userErrors {         field         message         __typename       }       __typename     }   }`
}) }) .then(r => r.json()) .then(console.log);
