import {
  Args,
  Result,
  Serializable,
  bytesToFixedSizeArray,
  fixedSizeArrayToBytes,
  i32ToBytes,
  stringToBytes,
  bytesToI32,
  u64ToBytes,
  bytesToU64,
} from '@massalabs/as-types';
import {
  Address,
  Context,
  Storage,
  call,
  createEvent,
  generateEvent,
  transferCoins,
} from '@massalabs/massa-as-sdk';
import { PersistentMap } from '../libraries/PersistentMap';
import {
  _notApproved,
  _notExecuted,
  _onlyOwner,
  _txExists,
  addOwner,
  addTransaction,
  buildApprovalKey,
  getApprovalCount,
  required,
} from './utils';
import { REQUIRED, APPROVED, TRANSACTIONS } from '../storage/Multisig';

export function constructor(bs: StaticArray<u8>): void {
  generateEvent('constructor');
  generateEvent(
    '🚀 ~ file: Multisig.ts:106 ~ constructor ~ isDeployingContract:' +
      Context.isDeployingContract().toString(),
  );
  assert(Context.isDeployingContract(), 'already deployed');

  const args = new Args(bs);
  const owners = args.nextFixedSizeArray<string>().unwrap();
  const required = args.nextI32().unwrap();
  assert(owners.length > 0, 'owners required');
  assert(required > 0 && required <= owners.length, 'invalid required');

  for (let i = 0; i < owners.length; i++) {
    addOwner(owners[i]);
  }
  Storage.set(REQUIRED, i32ToBytes(required));
}

export function receive(_: StaticArray<u8>): void {
  const event = createEvent('Deposit', [
    Context.caller().toString(),
    Context.transferredCoins().toString(),
  ]);
  generateEvent(event);
}

export function submit(bs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(bs);
  const to = new Address(args.nextString().unwrap());
  const value = args.nextU64().unwrap();
  const data = args.nextBytes().unwrap();

  _onlyOwner();

  const id = addTransaction(to, value, data);

  const event = createEvent('Submit', [
    id.toString(),
    to.toString(),
    value.toString(),
    data.toString(),
  ]);
  generateEvent(event);

  return u64ToBytes(id);
}

export function approve(bs: StaticArray<u8>): void {
  const args = new Args(bs);
  const txId = args.nextU64().unwrap();

  _onlyOwner();
  _txExists(txId);
  _notApproved(txId);
  _notExecuted(txId);

  APPROVED.set(buildApprovalKey(txId, Context.caller()), true);

  const event = createEvent('Approve', [
    txId.toString(),
    Context.caller().toString(),
  ]);
  generateEvent(event);
}

export function execute(bs: StaticArray<u8>): void {
  const args = new Args(bs);
  const txId = args.nextU64().unwrap();

  _onlyOwner();
  _txExists(txId);
  _notExecuted(txId);

  assert(getApprovalCount(txId) >= required(), 'not enough approvals');

  const tx = TRANSACTIONS.getSome(txId);
  tx.executed = true;
  TRANSACTIONS.set(txId, tx);

  transferCoins(tx.to, tx.value);
  // OR
  // call(tx.to, 'receive', new Args().add(tx.data), tx.value);

  const event = createEvent('Execute', [txId.toString()]);
  generateEvent(event);
}

export function revoke(bs: StaticArray<u8>): void {
  const args = new Args(bs);
  const txId = args.nextU64().unwrap();

  _onlyOwner();
  _txExists(txId);
  _notExecuted(txId);

  const key = buildApprovalKey(txId, Context.caller());
  assert(APPROVED.contains(key), 'tx not approved');
  APPROVED.set(key, false);

  const event = createEvent('Revoke', [
    Context.caller().toString(),
    txId.toString(),
  ]);
  generateEvent(event);
}
