// Admin actions run as the canisters' app-level admin identity (the deploy
// identity — see docs/DEPLOYMENT.md, "Claim app-level admin"). Used by the
// "Admin task" workflow (.github/workflows/admin-task.yml) and by hand:
//
//   node scripts/admin.mjs <environment> set-role <principal> <Official|Coordinator|Assessor|Admin>
//   node scripts/admin.mjs <environment> set-push-relay <principal|none>
//
// set-push-relay registers the separate identity the scheduled push relay
// runs as: it may read push subscriptions and pending streak events, and
// nothing else.

import { Actor } from "@icp-sdk/core/agent";
import { Principal } from "@icp-sdk/core/principal";
import { connect, ensureAdmin } from "./lib/icp.mjs";

const [environment, task, target, roleName] = process.argv.slice(2);
const ROLES = ["Official", "Coordinator", "Assessor", "Admin"];

const userIdl = ({ IDL: I }) => {
  const Role = I.Variant({ Official: I.Null, Assessor: I.Null, Admin: I.Null, Coordinator: I.Null });
  const Profile = I.Record({ principal: I.Principal, displayName: I.Text, role: Role, sport: I.Text, level: I.Text, state: I.Text, preferredLanguage: I.Text, createdAt: I.Int });
  const ResultUnit = I.Variant({ ok: I.Null, err: I.Text });
  return I.Service({
    setAdmin: I.Func([I.Principal], [ResultUnit], []),
    setRole: I.Func([I.Principal, Role], [I.Variant({ ok: Profile, err: I.Text })], []),
    setPushRelay: I.Func([I.Opt(I.Principal)], [ResultUnit], []),
  });
};

const rankingIdl = ({ IDL: I }) => {
  const ResultUnit = I.Variant({ ok: I.Null, err: I.Text });
  return I.Service({
    setAdmin: I.Func([I.Principal], [ResultUnit], []),
    setPushRelay: I.Func([I.Opt(I.Principal)], [ResultUnit], []),
  });
};

function usage(msg) {
  console.error(msg);
  console.error("Usage: node scripts/admin.mjs <environment> set-role <principal> <Official|Coordinator|Assessor|Admin>");
  console.error("       node scripts/admin.mjs <environment> set-push-relay <principal|none>");
  process.exit(2);
}

function ok(name, res) {
  if ("err" in res) throw new Error(`${name}: ${res.err}`);
  return res.ok;
}

async function main() {
  if (!environment || !task || !target) usage("Missing arguments.");

  if (task === "set-role") {
    if (!ROLES.includes(roleName)) usage(`Role must be one of ${ROLES.join(", ")}.`);
    const { agent, principal, ids } = await connect(environment, ["user"]);
    const user = Actor.createActor(userIdl, { agent, canisterId: ids.user });
    await ensureAdmin("user", user, principal);
    const profile = ok("setRole", await user.setRole(Principal.fromText(target), { [roleName]: null }));
    console.log(`✓ ${profile.displayName || target} is now ${roleName} on ${environment}`);
  } else if (task === "set-push-relay") {
    const relay = target === "none" ? [] : [Principal.fromText(target)];
    const { agent, principal, ids } = await connect(environment, ["user", "ranking"]);
    const user = Actor.createActor(userIdl, { agent, canisterId: ids.user });
    const ranking = Actor.createActor(rankingIdl, { agent, canisterId: ids.ranking });
    await ensureAdmin("user", user, principal);
    await ensureAdmin("ranking", ranking, principal);
    ok("user.setPushRelay", await user.setPushRelay(relay));
    ok("ranking.setPushRelay", await ranking.setPushRelay(relay));
    console.log(relay.length ? `✓ Push relay identity on ${environment} is now ${target}` : `✓ Push relay identity cleared on ${environment}`);
  } else {
    usage(`Unknown task "${task}".`);
  }
}

main().catch((err) => {
  console.error("Admin task failed:", err.message ?? err);
  process.exit(1);
});
