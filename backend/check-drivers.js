"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const p = new client_1.PrismaClient();
async function main() {
    const rows = await p.driver.findMany({ take: 2, include: { owner: true } });
    console.log(JSON.stringify(rows, null, 2));
    console.log('total choferes:', await p.driver.count());
}
main().finally(() => p.$disconnect());
//# sourceMappingURL=check-drivers.js.map