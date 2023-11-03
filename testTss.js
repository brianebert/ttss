import {SigningAccount, COL_Node} from "@brianebert/tss";
import * as toml from "toml";
import * as fs from 'fs';

// turn off caching to force ipfs repo reads
COL_Node.cache.readFrom = false;

// shorten long strings
function abrevIt(id){
  return `${id.slice(0, 5)}...${id.slice(-5)}`
}

// two test account ids (TA_[01]) and secret strings (TS_[01]) are required
if(Object.keys(fs.default).length) // running node
  var {TA_0, TS_0, TA_1, TS_1} = toml.parse(fs.readFileSync('app.toml', 'utf8'));
else // get keys from browswer user
  var {TA_0, TS_0, TA_1, TS_1} = await new Promise((resolve, reject) => 
      document.getElementById(`keys`).addEventListener('change', (e) => 
        resolve(JSON.parse(e.target.value))
      )
    );

console.log(`TA_0: ${TA_0}, \nTS_0: ${TS_0}, \nTA_1: ${TA_1}, \nTS_1: ${TS_1}`);

// make four level graph to test on:
//       g00
//       /  \
//    g10    g11
//    /  \   /  \
// g20    g21   g22
//     \_  |  _/
//       \ | /
//        g30
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
  // showNode will be called on each node read by COL_Node.traverse()
  function showNode(instance){
    // extract major axis from node name and indent that much
    const indent = 1 + parseInt(instance.name.slice(1,2));
    for(let i=0; i < indent; i++){
      console.group();
      console.group();
      console.group();
    }
    // nodes are printed in leaf first order, with the root node at the bottom
    console.log(`node ${instance.name} at ${instance.cid.toString()} contains: `, instance.value);
    for(let i=0; i < indent; i++){
      console.groupEnd();
      console.groupEnd();
      console.groupEnd();
    }
  }
  await COL_Node.traverse(head.cid, showNode, keys);
  console.log(`finished traversal of graph headed at ${head.cid.toString()}`);
}

// tests encrypted graph write and read for self
async function asymetricKeyTest(signingAccount){
  console.log(`building graph for asymetric key test`);
  const wKeys = {reader: signingAccount.ec25519.pk, writer: signingAccount.ec25519.sk};
  const rKeys = {reader: signingAccount.ec25519.sk, writer: signingAccount.ec25519.pk};
  const graph = await makeGraph(wKeys);
  console.log(`testing graph management with asymetric key encryption on new graph at head ${graph.g00.cid.toString()}`);
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

// tests encrypted graph write and read with key shared with another account
async function sharedKeyTest(signingAccount, shareWith){
  console.log(`building graph for shared key test`);
  const shk = await signingAccount.sharedKeys(shareWith.account.id, 'libsodium_kx_pk');
  const keys = {shared: shk.tx};
  const graph = await makeGraph(keys);
  console.log(`testing graph management with shared key encryption on new graph at head ${graph.g00.cid.toString()}`);
  await showGraph(graph.g00, keys);
 
  // this time do both update and delete without showing graph between states
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
  // if sk is falsy, will call wallet to sign key derivation transaction
  await signingAccount.deriveKeys(sk, {asymetric: 'Asymetric', signing: 'Signing', shareKX: 'ShareKX'});

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

// uses message token asste_code to determine which cipher to use
// traverses linked data
async function readMessages(messages){
  for(const message of messages){
    switch(message.asset_code){
    case 'MessageMe':
      const pk = await SigningAccount.dataEntry(message.from, 'libsodium_box_pk');
      var keys = {reader: this.ec25519.sk, writer: pk};
      var node = await COL_Node.read(SigningAccount.memoToCID(message.transaction.memo), keys);
      break;
    case 'ShareData':
      const {rx, tx} = await this.sharedKeys(message.from, 'libsodium_kx_pk');
      var keys = {shared: rx};
      var node = await COL_Node.read(SigningAccount.memoToCID(message.transaction.memo), keys);
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

// tests:
// - management of graph encrypted for self with public/private keys
// - sending and receiving of short message encrypted from sender to
//   receiver with public/private keys
// - management of graph encrypted with key shared between sender and receiver
// - discovery and processing of unread messages waiting at start of reader
// - real time processing of incoming messages
async function testCols(){
  // need two test accounts to test encryption and messaging
  const sA0 = await initSigningAccount(TA_0, TS_0);
  const sA1 = await initSigningAccount(TA_1, TS_1);
  if(!(sA0 instanceof SigningAccount) || !(sA1 instanceof SigningAccount))
    throw new Error(`failed to create signing accounts.`)

  // create a short, private message between accounts and send it from the first account to the second
  const pk = await SigningAccount.dataEntry(sA1, 'libsodium_box_pk');
  const message = new COL_Node({colName: 'private message', message:`hi, ${abrevIt(sA1.account.id)}!`});
  const result = await message.write('', {reader: pk, writer: sA0.ec25519.sk});
  const receipt0 = await sA0.messengerTx(message.cid, sA1.account.id, 'MessageMe');
  console.log(`sent transaction ${abrevIt(receipt0.hash)} created at ${receipt0.created_at} carries memo ${abrevIt(receipt0.memo)} `);

  // keep the receiving account busy while the message travels
  await asymetricKeyTest(sA1);
  console.log(`finished asymetricKeyTest()`);
  
  // verify watcher finds and a message waiting and processes it
  const waiting = await sA1.watcher.start(sA1, readMessages);
  console.log(`SigningAccount ${abrevIt(sA1.account.id)} MessageWatcher found ${waiting.length} message(s) waiting`);

  // repeat graph management test with shared key encryption
  const sharedData = await sharedKeyTest(sA0, sA1);
  console.log(`finished sharedKeyTest()`);
  
  // send the graph root address to the other account to receive and process in real time
  let receipt1 = await sA0.messengerTx(sharedData.cid, sA1.account.id, 'ShareData');
  console.log(`sent transaction ${abrevIt(receipt1.hash)} created at ${receipt1.created_at} carries memo ${abrevIt(receipt1.memo)} `);
}

testCols()