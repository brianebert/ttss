import {SigningAccount, COL_Node} from "@brianebert/tss";
import * as toml from "toml";
import * as fs from 'fs';

COL_Node.cache.readFrom = false;
function abrevIt(id){
  return `${id.slice(0, 5)}...${id.slice(-5)}`
}
const {TA_0, TS_0, TA_1, TS_1} = toml.parse(fs.readFileSync('app.toml', 'utf8'));

async function makeGraph(keys){
  // object indices allow direct manipulation of node values
  const g = {};
  g['g30'] = await new COL_Node({'colName': 'g30'});
  g['g20'] = await new COL_Node({'colName': 'g20'}).insert(g['g30'], 'g30', keys);
  g['g21'] = await new COL_Node({'colName': 'g21'}).insert(g['g30'], 'g30', keys);
  g['g22'] = await new COL_Node({'colName': 'g22'}).insert(g['g30'], 'g30', keys);
  g['g10'] = await new COL_Node({'colName': 'g10'}).insert(g['g20'], 'g20', keys);
  g['g11'] = await new COL_Node({'colName': 'g11'}).insert(g['g21'], 'g21', keys);
  g['g10'] = await g['g10'].insert(g['g21'], 'g21', keys);
  g['g11'] = await g['g11'].insert(g['g22'], 'g22', keys);
  g['g00'] = await new COL_Node({'colName': 'g00'}).insert(g['g10'], 'g10', keys);
  g['g00'] = await g['g00'].insert(g['g11'], 'g11', keys);
  return g
}

// recursive COL_Node.traverse() displays nodes of graph in reverse depth first order
async function showGraph(head, keys=null){
  console.log(`starting traversal of graph headed at ${head.cid.toString()}`);
  function showNode(instance){

    const indent = parseInt(instance.name.slice(1,2));
    for(let i=0; i < indent; i++){
      console.group();
      console.group();
      console.group();
    }
    console.log(`node ${instance.name} at ${instance.cid.toString()} contains: `, instance.value);
    for(let i=0; i < indent; i++){
      console.groupEnd();
      console.groupEnd();
      console.groupEnd();
    }
  }
  await COL_Node.traverse(head.cid, showNode, keys);
}

async function asymetricKeyTest(signingAccount){
  console.log(`testing graph management with asymetric key encryption`);
  const wKeys = {reader: signingAccount.ec25519.pk, writer: signingAccount.ec25519.sk};
  const rKeys = {reader: signingAccount.ec25519.sk, writer: signingAccount.ec25519.pk};
  const graph = await makeGraph(wKeys);
  console.log(`made new graph at head ${graph.g00.cid.toString()}`);
  await showGraph(graph.g00, rKeys);

  // change value of leaf node and bubble hash changes to new graph head
  let value = Object.assign({}, graph.g30.value);
  value['keyType'] = 'asymetric';
  let head = await graph.g30.update(value, wKeys);
  console.log(`updated graph head ${head.cid.toString()}`);
  await showGraph(head, rKeys);

  // delete a node and bubble hash changes to new graph head
  head = await graph.g20.delete(wKeys);
  console.log(`updated graph head ${head.cid.toString()}`);
  await showGraph(head, rKeys);

  return head
}

async function sharedKeyTest(signingAccount, shareWith){
  console.log(`testing graph management with shared key encryption`);
  const shk = await signingAccount.sharedKeys(shareWith.account.id, 'libsodium_kx_pk');
  const keys = {shared: shk.tx};
  const graph = await makeGraph(keys);
  await showGraph(graph.g00, keys);
 
  let value = Object.assign({}, graph.g30.value);
  value['keyType'] = 'shared';
  let head = await graph.g30.update(value, keys);
  console.log(`updated graph head ${head.cid.toString()}`);

  head = await graph.g20.delete(keys);
  console.log(`updated graph head ${head.cid.toString()}`);
  await showGraph(head, keys);

  return head
}

// will derive signing keys, asymetric encryption keys, 
// and key exchange keys for shared key encryption
async function initSigningAccount(address=null, sk=null){
  if(address)
    var signingAccount = new SigningAccount(address);
  else
    var signingAccount = await SigningAccount.fromWallet()

  if(!signingAccount)
    return Promise.resolve(null)
  console.log(`initializing SigningAccount ${abrevIt(signingAccount.account.id)}`);
  // if sk is not provided, will call wallet to sign key derivation transaction
  await signingAccount.deriveKeys(sk);

  // adds derived ed25519 key to account signers
  let accountState = await signingAccount.addSigner();

  // will execute transactions to add data entries with public keys if not present already
  await signingAccount.setDataEntry('libsodium_box_pk', Buffer.from(signingAccount.ec25519.pk));
  await signingAccount.setDataEntry('libsodium_kx_pk', Buffer.from(signingAccount.shareKX.pk));

  // creates sell offers for messaging tokens if they don't already exist
  // MessageMe communicates message is encoded with asymetric keys
  // ShareData communicates message is encoded with a shared key
  for(let token of ['MessageMe', 'ShareData']){
    await SigningAccount.sellOffer(signingAccount, {selling: token});
  }
  return signingAccount
}

async function testCols(){
  const sA0 = await initSigningAccount(TA_0, TS_0);
  const sA1 = await initSigningAccount(TA_1, TS_1);

  // create, encrypt and modify related nodes using asymetric keys
  if(sA1 instanceof SigningAccount)
    await asymetricKeyTest(sA1, sA0);
  else
    throw new Error(`initSigningAccount returned: `, sA1);
  console.log(`finished asymetricKeyTest()`);

  console.log(`encrypting messaging betweenb accounts ${abrevIt(sA1.account.id)} and ${abrevIt(sA0.account.id)}`);
  const pk = await SigningAccount.dataEntry(sA0, 'libsodium_box_pk');
  const message = new COL_Node({colName: 'private message', message:`hi, ${sA0.account.id} at ${new Date().toUTCString()}!`});
  const result = await message.write('', {reader: pk, writer: sA1.ec25519.sk});
  const receipt0 = await sA1.messengerTx(message.cid, sA0.account.id, 'MessageMe');
  console.log(`sent ${receipt0.asset_code} transaction ${abrevIt(receipt0.hash)} created at ${receipt0.created_at} carries memo ${abrevIt(receipt0.memo)} `);

  console.log(`starting message watcher on SigningAccount ${abrevIt(sA0.account.id)}`);
  await sA0.watcher.start(sA0, nodes => console.log(`you have received ${nodes.length} message(s): `, nodes));

  const sharedData = await sharedKeyTest(sA1, sA0);
  console.log(`finished sharedKeyTest()`);
  let receipt1 = await sA1.messengerTx(sharedData.cid, sA0.account.id, 'ShareData');
  console.log(`sent ${receipt1.asset_code} transaction ${abrevIt(receipt1.hash)} created at ${receipt1.created_at} carries memo ${abrevIt(receipt1.memo)} `);
}

testCols()