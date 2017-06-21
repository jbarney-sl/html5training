import moment from 'moment'
import t from 'tcomb'
import uuidv4 from 'uuid/v4'

import { uuid } from './extraTcombTypes'
import { Order, BUY, SELL } from './order'

const Balance = t.struct(
  { money: t.Integer, stock: t.Integer },
  'Account Balance'
)
const Balances = t.dict(uuid, Balance, 'Account Balances')

const HistoryEntry = t.struct({
  buyer: uuid,
  seller: uuid,
  buyPrice: t.Integer,
  sellPrice: t.Integer,
  quantity: t.Integer,
  time: t.Any
})

const History = t.list(HistoryEntry)

export default class Matcher {
  constructor () {
    this.buyOrders = []
    this.sellOrders = []
    this.overheadMade = 0
    this.users = new Balances({})
    this.history = new History([])
  }

  getHistory = () => {
    return this.history
  }

  getOverheadMade = () => {
    return this.overheadMade
  };

  addUser = (money, stock) => {
    const userid = uuidv4()
    const userbalance = new Balance({ money, stock })
    const changes = new Balances({ [userid]: userbalance })
    this.users = Balances.update(this.users, { $merge: changes })
    return userid
  };

  getUsers = () => {
    return this.users
  };

  addOrder = order => {
    order = Order.update(order, { time: { $set: moment() } })
    this.addOrderPreservingTimestamp(order)
  };

  addOrderPreservingTimestamp = order => {
    // This function is not part of the external API
    // It's possible to pass garbage in as a timestamp and break things
    if (!(order instanceof Order)) {
      throw new Error('Asked to add something other than an Order')
    }
    if (order.quantity === 0) {
      throw new Error('Orders for 0 are not allowed')
    }
    if (order.action === BUY) {
      this.buyOrders.push(order)
    } else if (order.action === SELL) {
      this.sellOrders.push(order)
    } else {
      throw new Error('Unexpected order action')
    }
  };

  getOrdersByAccount = account => {
    const buyOrders = this.buyOrders.filter(o => o.account === account)
    const sellOrders = this.sellOrders.filter(o => o.account === account)
    return buyOrders.concat(sellOrders)
  };

  getBestBuyOrder = () => {
    // the best buy order is the largest price, followed by the most recent
    this.buyOrders.sort((a, b) => {
      if (0 !== b.price - a.price) {
        return b.price - a.price
      } else {
        return a.time.diff(b.time)
      }
    })
    const bestOrder = this.buyOrders[0]
    if (!bestOrder) {
      throw new Error("There aren't any buy orders")
    } else {
      return bestOrder
    }
  };

  getBestNBuyOrders = n => {
    // call to sort
    try {
      this.getBestBuyOrder()
    } catch (e) {
      return []
    }
    return this.buyOrders.slice(0, n)
  };

  getBestSellOrder = () => {
    // the best sell order is the lowest price, followed by the most recent
    this.sellOrders.sort((a, b) => {
      if (0 !== a.price - b.price) {
        return a.price - b.price
      } else {
        return a.time.diff(b.time)
      }
    })
    const bestOrder = this.sellOrders[0]
    if (!bestOrder) {
      throw new Error("There aren't any sell orders")
    } else {
      return bestOrder
    }
  };

  getBestNSellOrders = n => {
    try {
      this.getBestSellOrder()
    } catch (e) {
      return []
    }
    return this.sellOrders.slice(0, n)
  };

  hasFoundOverlap = () => {
    try {
      const bestBuyOrder = this.getBestBuyOrder()
      const bestSellOrder = this.getBestSellOrder()
      return bestBuyOrder.price > bestSellOrder.price
    } catch (e) {
      return false
    }
  };

  processOrder = () => {
    if (!this.hasFoundOverlap()) {
      throw new Error("Can't process orders when they don't overlap")
    }
    const bestBuyOrder = this.getBestBuyOrder()
    const bestSellOrder = this.getBestSellOrder()
    const sellingUser = this.users[bestSellOrder.account]
    const buyingUser = this.users[bestBuyOrder.account]

    let stockDelta = Math.min(bestBuyOrder.quantity, bestSellOrder.quantity)
    if (sellingUser.stock < bestSellOrder.quantity) {
      stockDelta = sellingUser.stock // you can't sell more than you have
    }
    if (stockDelta === 0) {
      // seller with no stock will clog the market, remove order
      this.sellOrders.shift()
      return
    }

    let singleBuyCost = bestBuyOrder.price
    let totalBuyCost = singleBuyCost * stockDelta
    if (buyingUser.money < singleBuyCost) {
      // not enough money to buy even one
      this.buyOrders.shift() // to prevent clogging the market, remove that buy order since it's impossible to fulfil
      return
    }

    if (buyingUser.money < totalBuyCost) {
      // if we don't have enough money for all, how many can we buy?
      stockDelta = Math.floor(buyingUser.money / singleBuyCost)
      totalBuyCost = singleBuyCost * stockDelta
    }
    // Now we've removed useless orders and limited the buyer, we can proceed
    const totalSellCost = stockDelta * bestSellOrder.price
    const overhead = totalBuyCost - totalSellCost

    this.overheadMade += overhead

    const newBuyerStock = buyingUser.stock + stockDelta
    const newSellerStock = sellingUser.stock - stockDelta
    const newBuyerMoney = buyingUser.money - totalBuyCost
    const newSellerMoney = sellingUser.money + totalSellCost

    const usersPatch = {
      [bestBuyOrder.account]: { money: newBuyerMoney, stock: newBuyerStock },
      [bestSellOrder.account]: {
        money: newSellerMoney,
        stock: newSellerStock
      }
    }
    this.users = Balances.update(this.users, { $merge: usersPatch })

    // Add new partial orders if necessary, making sure not to modify the time
    if (stockDelta < bestBuyOrder.quantity) {
      const newQuantity = bestBuyOrder.quantity - stockDelta
      const order = Order.update(bestBuyOrder, {
        quantity: { $set: newQuantity }
      })
      this.addOrderPreservingTimestamp(order)
    }
    if (stockDelta < bestSellOrder.quantity) {
      const newQuantity = bestSellOrder.quantity - stockDelta
      const order = Order.update(bestSellOrder, {
        quantity: { $set: newQuantity }
      })
      this.addOrderPreservingTimestamp(order)
    }
    // Remove the old orders
    this.buyOrders.shift()
    this.sellOrders.shift()

    const entry = new HistoryEntry({
      buyer: bestBuyOrder.account,
      seller: bestSellOrder.account,
      buyPrice: bestBuyOrder.price,
      sellPrice: bestSellOrder.price,
      quantity: stockDelta,
      time: moment()
    })
    this.history = History.update(this.history, { $push: [entry] })
  };
}
