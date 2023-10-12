import {SigningAccount, COL_Node} from "@brianebert/tss";
import * as toml from "toml";
import * as fs from 'fs';

const {TA_0, TS_0, TA_1, TS_1} = toml.parse(fs.readFileSync('app.toml', 'utf8'));

async function makeGraph(keys){
  // object indices allow direct manipulation of node values during test
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

function showGraph(head, indent){

}

async function asymetricKeyTest(signingAccount, shareWith){
  console.log(`testing graph creation and modification with asymetric key encryption`);
  const wKeys = {reader: signingAccount.ec25519.pk, writer: signingAccount.ec25519.sk};
  const rKeys = {reader: signingAccount.ec25519.sk, writer: signingAccount.ec25519.pk};
  const graph = await makeGraph(wKeys);
  console.log(`made new graph: `, graph.g00.value);

  let traversed = await COL_Node.traverse(graph.g00.cid, (instance)=>{
    console.log(`called app function 0 on ${instance.name}, address: ${instance.cid.toString()}, value: `, instance.value);
  }, rKeys);
  console.log(`traversed new graph, head ${traversed.cid.toString()} `, traversed.value);

  let value = Object.assign({}, graph.g30.value);
  value['keyType'] = 'asymetric';
  let head = await graph.g30.update(value, wKeys);
console.log(`updated graph to head ${head.cid.toString()}: `, head.value);
  traversed = await COL_Node.traverse(head.cid, (instance)=>{
    console.log(`called app function 1 on ${instance.name}, address: ${instance.cid.toString()}, value: `, instance.value);
  }, rKeys);
//throw new Error(`let's stop here!`)
  head = await graph.g20.delete(wKeys);

  traversed = await COL_Node.traverse(head.cid, (instance)=>{console.log(`called app function 2 on ${instance.name}`)}, rKeys);
  console.log(`asymetricKeyTest modified graph at ${traversed.cid.toString()}:`, traversed.value);

  return head
}

async function sharedKeyTest(signingAccount, shareWith){
  console.log(`testing graph creation and modification with shared key encryption`);
  const shk = await signingAccount.sharedKeys(shareWith.account.id, 'libsodium_kx_pk');
  const keys = {shared: shk.tx};
  const graph = await makeGraph(keys);
  console.log(`made new graph: `, await COL_Node.traverse(graph.g00.cid, keys));

  let value = Object.assign({}, graph.g30.value);
  value['keyType'] = 'shared';
  let head = await graph.g30.update(value, wKeys);

  head = await graph.g20.delete(keys);

  return head
}

async function initSigningAccount(address=null, sk=null){
  if(address)
    var signingAccount = new SigningAccount(address);
  else
    var signingAccount = await SigningAccount.fromWallet()

  if(!signingAccount)
    return Promise.resolve(null)

  await signingAccount.deriveKeys(sk);
//console.log(`have derived keys for signingAccount: `, signingAccount.ed25519);
  let accountState = await signingAccount.addSigner();

  await signingAccount.setDataEntry('libsodium_kx_pk', Buffer.from(signingAccount.shareKX.pk));

  await signingAccount.setDataEntry('libsodium_box_pk', Buffer.from(signingAccount.ec25519.pk));

  for(let token of ['MessageMe', 'ShareData']){
    await SigningAccount.sellOffer(signingAccount, {selling: token});
  }
  //console.log(`initialized signingAccount ${signingAccount.account.id}: `, signingAccount);
  return signingAccount
}

async function testCols(){
  const sA1 = await initSigningAccount(TA_1, TS_1);

  /*if(sA1 instanceof SigningAccount)
    await asymetricKeyTest(sA1);
  else
    console.error(`initSigningAccount returned: `, sA1);
  */
  const sA0 = await initSigningAccount(TA_0, TS_0);

  const pk = await SigningAccount.dataEntry(sA0, 'libsodium_box_pk');
  const message = new COL_Node({colName: 'private message', message:`hi, ${sA0.account.id} at ${new Date().toUTCString()}!`});
  const result = await message.write('', {reader: pk, writer: sA1.ec25519.sk});
  const receipt0 = await sA1.messengerTx(message.cid, sA0.account.id, 'MessageMe');
  console.log(`MessageMe transaction ${receipt0.hash} created at ${receipt0.created_at} carries memo ${receipt0.memo} `);

  const oldMsgs = await sA0.watcher.start(sA0, nodes => console.log(`received message(s): `, nodes));
throw new Error(`Stopping before sharedKeyTest()`)
  const sharedData = await sharedKeyTest(sA1, sA0);

  let receipt1 = await sA1.messengerTx(sharedData.cid, sA0.account.id, 'ShareData');
  console.log(`ShareData transaction result is: `, receipt1);
}

testCols()