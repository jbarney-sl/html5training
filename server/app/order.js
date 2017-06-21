import t from 'tcomb'
import {uuid} from './extraTcombTypes'

export const BUY = 'BUY'
export const SELL = 'SELL'

const action = t.enums.of([BUY, SELL], 'Order Action')

export const Order = t.struct({
  account: uuid,
  price: t.Integer,
  quantity: t.Integer,
  action,
  time: t.Any
})
