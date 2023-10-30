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
  value['keyType'] = `asymetric ${new Date().toUTCString()}`;
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
  value['keyType'] = `shared ${new Date().toUTCString()}`;
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

async function readMessages(messages){
  for(const message of messages){
    switch(message.asset_code){
    case 'MessageMe':
      const pk = await SigningAccount.dataEntry(message.from, 'libsodium_box_pk');
      var keys = {reader: this.ec25519.sk, writer: pk};
      var node = await COL_Node.fromCID(SigningAccount.memoToCID(message.transaction.memo), keys);
      break;
    case 'ShareData':
      const {rx, tx} = await this.sharedKeys(message.from, 'libsodium_kx_pk');
      var keys = {shared: rx};
      var node = await COL_Node.fromCID(SigningAccount.memoToCID(message.transaction.memo), keys);
      break;
    default:
      throw new Error(`wasn't expecting to get here`)
    }
    const links = node.links;
    for(const key of Object.keys(links))
      if(key.endsWith('_last'))
        delete links[key];
    if(Object.keys(links).length){
      console.log(`traversing message from ${abrevIt(message.from)} at ${abrevIt(node.cid.toString())}`);
      await showGraph(node, keys);
    }
    else 
      console.log(`node ${node.name} at ${abrevIt(node.cid.toString())} contains: `, node.value);
  }
}

async function testCols(){
  const sA0 = await initSigningAccount(TA_0, TS_0);
  const sA1 = await initSigningAccount(TA_1, TS_1);

  if(!(sA0 instanceof SigningAccount) || !(sA1 instanceof SigningAccount))
    throw new Error(`failed to create signing accounts.`)

  const pk = await SigningAccount.dataEntry(sA1, 'libsodium_box_pk');
  const message = new COL_Node({colName: 'private message', message:`hi, ${abrevIt(sA1.account.id)} at ${new Date().toUTCString()}!`});
  const result = await message.write('', {reader: pk, writer: sA0.ec25519.sk});
  const receipt0 = await sA0.messengerTx(message.cid, sA1.account.id, 'MessageMe');
  console.log(`sent transaction ${abrevIt(receipt0.hash)} created at ${receipt0.created_at} carries memo ${abrevIt(receipt0.memo)} `);

  await asymetricKeyTest(sA1, sA0);
  console.log(`finished asymetricKeyTest()`);
  
  const waiting = await sA1.watcher.start(sA1, readMessages);
  console.log(`SigningAccount ${abrevIt(sA1.account.id)} MessageWatcher found ${waiting.length} message(s) waiting`);

  const sharedData = await sharedKeyTest(sA0, sA1);
  console.log(`finished sharedKeyTest()`);
  let receipt1 = await sA0.messengerTx(sharedData.cid, sA1.account.id, 'ShareData');
  console.log(`sent transaction ${abrevIt(receipt1.hash)} created at ${receipt1.created_at} carries memo ${abrevIt(receipt1.memo)} `);
}

testCols()