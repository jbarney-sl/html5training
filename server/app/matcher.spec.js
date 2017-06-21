import uuidv4 from 'uuid/v4'

import Matcher from './matcher'
import { Order, BUY, SELL } from './order'

describe('Matcher', () => {
  let matcher
  let alice, bob, charlie, dee

  beforeEach(() => {
    matcher = new Matcher()
    alice = matcher.addUser(15000, 71)
    bob = matcher.addUser(19000, 17)
    charlie = matcher.addUser(43000, 0)
    dee = matcher.addUser(120, 4)
  })

  it('can be created', () => {
    expect(matcher).not.toBeNull()
  })

  it('accepts new users', () => {
    const money = 1600
    const stock = 90
    const userid = matcher.addUser(money, stock)
    expect(matcher.getUsers()[userid]).toMatchObject({ money, stock })
  })

  it('receives buy orders', () => {
    let order = new Order({
      account: alice,
      price: 1400,
      quantity: 12,
      action: BUY
    })
    matcher.addOrder(order)
    const { time: deletedKey, ...timelessOrder } = order
    expect(matcher.getBestBuyOrder()).toMatchObject(timelessOrder)
  })

  it('receives sell orders', () => {
    let order = new Order({
      account: alice,
      price: 1300,
      quantity: 10,
      action: SELL
    })
    matcher.addOrder(order)
    const { time: deletedKey, ...timelessOrder } = order
    expect(matcher.getBestSellOrder()).toMatchObject(timelessOrder)
  })

  it('rejects malformed orders', () => {
    expect(() => {
      let order = new Order({
        account: alice,
        price: 1300,
        quantity: 10,
        action: 'DANCE' // Not a valid action
      })
      matcher.addOrder(order)
    }).toThrow()
    expect(() => {
      let order = new Order({
        account: 'NOT A VALID UUID', // must be a valid UUID
        price: 1300,
        quantity: 10,
        action: SELL
      })
      matcher.addOrder(order)
    }).toThrow()
    expect(() => {
      let order = new Order({
        account: alice,
        price: 13001.112, // No decimals allowed
        quantity: 10,
        action: BUY
      })
      matcher.addOrder(order)
    }).toThrow()
  })

  it('favours higher buy orders', () => {
    let order1 = new Order({
      account: alice,
      price: 1400,
      quantity: 12,
      action: BUY
    })
    let order2 = new Order({
      account: alice,
      price: 1450,
      quantity: 12,
      action: BUY
    })
    matcher.addOrder(order1)
    matcher.addOrder(order2)
    const { time: deletedKey, ...timelessOrder2 } = order2
    expect(matcher.getBestBuyOrder()).toMatchObject(timelessOrder2)
  })

  it('favours lower sell orders', () => {
    let order1 = new Order({
      account: alice,
      price: 1400,
      quantity: 12,
      action: SELL
    })
    let order2 = new Order({
      account: alice,
      price: 1450,
      quantity: 12,
      action: SELL
    })
    matcher.addOrder(order1)
    matcher.addOrder(order2)
    const { time: deletedKey, ...timelessOrder1 } = order1
    expect(matcher.getBestSellOrder()).toMatchObject(timelessOrder1)
  })

  it('prefers older sell orders in the case of a tie', done => {
    expect.assertions(1) // ensure assertions are run

    const uuid1 = uuidv4()
    const uuid2 = uuidv4()
    let order1 = new Order({
      account: uuid1,
      price: 1300,
      quantity: 10,
      action: SELL
    })
    let order2 = new Order({
      account: uuid2,
      price: 1300,
      quantity: 10,
      action: SELL
    })
    matcher.addOrder(order1)

    setTimeout(() => {
      // delay adding order2 by at least 1ms
      matcher.addOrder(order2)
      const { time: deletedKey, ...timelessOrder1 } = order1
      expect(matcher.getBestSellOrder()).toMatchObject(timelessOrder1)
      done()
    }, 1)
  })

  it('prefers older buy orders in the case of a tie', done => {
    expect.assertions(1) // ensure assertions are run

    const uuid1 = uuidv4()
    const uuid2 = uuidv4()
    let order1 = new Order({
      account: uuid1,
      price: 1300,
      quantity: 10,
      action: BUY
    })
    let order2 = new Order({
      account: uuid2,
      price: 1300,
      quantity: 10,
      action: BUY
    })
    matcher.addOrder(order1)

    setTimeout(() => {
      // delay adding order2 by at least 1ms
      matcher.addOrder(order2)
      const { time: deletedKey, ...timelessOrder1 } = order1
      expect(matcher.getBestBuyOrder()).toMatchObject(timelessOrder1)
      done()
    }, 1)
  })

  it('matches buy and sell orders when they overlap', () => {
    let buyOrder = new Order({
      account: alice,
      price: 1400,
      quantity: 10,
      action: BUY
    })
    let sellOrder = new Order({
      account: bob,
      price: 1300,
      quantity: 12,
      action: SELL
    })
    matcher.addOrder(buyOrder)
    matcher.addOrder(sellOrder)
    expect(matcher.hasFoundOverlap()).toBe(true)
  })

  it('does not match buy and sell orders when they do not overlap', () => {
    let buyOrder = new Order({
      account: alice,
      price: 1300,
      quantity: 10,
      action: BUY
    })
    let sellOrder = new Order({
      account: bob,
      price: 1400,
      quantity: 12,
      action: SELL
    })
    matcher.addOrder(buyOrder)
    matcher.addOrder(sellOrder)
    expect(matcher.hasFoundOverlap()).toBe(false)
  })

  it('refuses to process orders when they do not overlap', () => {
    let buyOrder = new Order({
      account: alice,
      price: 1300,
      quantity: 10,
      action: BUY
    })
    let sellOrder = new Order({
      account: bob,
      price: 1400,
      quantity: 12,
      action: SELL
    })
    matcher.addOrder(buyOrder)
    matcher.addOrder(sellOrder)
    expect(() => matcher.processOrder()).toThrow()
  })

  it('processes orders by moving money and stock between accounts', () => {
    // TODO probably shouldn't be using hardcoded values here
    let buyOrder = new Order({
      account: alice,
      price: 1500,
      quantity: 5,
      action: BUY
    })
    let sellOrder = new Order({
      account: bob,
      price: 1000,
      quantity: 5,
      action: SELL
    })
    matcher.addOrder(buyOrder)
    matcher.addOrder(sellOrder)
    expect(matcher.getOverheadMade()).toBe(0)
    matcher.processOrder()
    const users = matcher.getUsers()
    expect(users[alice]).toMatchObject({ money: 7500, stock: 76 })
    expect(users[bob]).toMatchObject({ money: 24000, stock: 12 })
    expect(matcher.getOverheadMade()).toBe(2500)
  })

  it('processes partial orders, preserving timestamp priority', () => {
    let buyOrder = new Order({
      account: alice,
      price: 1500,
      quantity: 6,
      action: BUY
    })
    let sellOrder = new Order({
      account: bob,
      price: 1000,
      quantity: 5,
      action: SELL
    })
    matcher.addOrder(buyOrder)
    matcher.addOrder(sellOrder)
    let bestBuyOrder = matcher.getBestBuyOrder()
    bestBuyOrder = Order.update(bestBuyOrder, { quantity: { $set: 1 } })
    expect(matcher.getOverheadMade()).toBe(0)
    matcher.processOrder()
    let users = matcher.getUsers()
    expect(users[alice]).toMatchObject({ money: 7500, stock: 76 })
    expect(users[bob]).toMatchObject({ money: 24000, stock: 12 })
    expect(matcher.getOverheadMade()).toBe(2500)
    expect(matcher.getBestBuyOrder()).toEqual(bestBuyOrder)
    sellOrder = new Order({
      account: bob,
      price: 500,
      quantity: 1,
      action: SELL
    })
    matcher.addOrder(sellOrder)
    matcher.processOrder()
    expect(matcher.getOverheadMade()).toBe(3500)
    expect(() => matcher.getBestBuyOrder()).toThrow()
    users = matcher.getUsers()
    expect(users[alice]).toMatchObject({ money: 6000, stock: 77 })
    expect(users[bob]).toMatchObject({ money: 24500, stock: 11 })
  })

  it('refuses to allow users to pay more than they have', () => {
    let buyOrder = new Order({
      account: alice,
      price: 10000,
      quantity: 6,
      action: BUY
    })
    let sellOrder = new Order({
      account: bob,
      price: 1000,
      quantity: 5,
      action: SELL
    })
    matcher.addOrder(buyOrder)
    matcher.addOrder(sellOrder)
    expect(matcher.getOverheadMade()).toBe(0)
    matcher.processOrder()
    const users = matcher.getUsers()
    expect(users[alice]).toMatchObject({ money: 5000, stock: 72 })
    expect(users[bob]).toMatchObject({ money: 20000, stock: 16 })
    expect(matcher.getOverheadMade()).toBe(9000)
  })

  it('rejects buy or sell orders with a quantity of zero', () => {
    let buyOrder = new Order({
      account: alice,
      price: 1500,
      quantity: 0,
      action: BUY
    })
    let sellOrder = new Order({
      account: bob,
      price: 1000,
      quantity: 0,
      action: SELL
    })
    expect(() => matcher.addOrder(buyOrder)).toThrow()
    expect(() => matcher.addOrder(sellOrder)).toThrow()
  })

  it('removes buy orders for accounts without enough money', () => {
    let possibleBuyOrder = new Order({
      account: alice,
      price: 1500,
      quantity: 5,
      action: BUY
    })
    let sellOrder = new Order({
      account: bob,
      price: 1000,
      quantity: 5,
      action: SELL
    })
    let impossibleBuyOrder = new Order({
      account: dee,
      price: 2000,
      quantity: 1,
      action: BUY
    })
    matcher.addOrder(possibleBuyOrder)
    matcher.addOrder(impossibleBuyOrder)
    matcher.addOrder(sellOrder)
    const {
      time: deletedKey,
      ...timelessImpossibleBuyOrder
    } = impossibleBuyOrder
    expect(matcher.getBestBuyOrder()).toMatchObject(timelessImpossibleBuyOrder)
    expect(matcher.getOverheadMade()).toBe(0)

    matcher.processOrder()

    let users = matcher.getUsers()
    expect(users[alice]).toMatchObject({ money: 15000, stock: 71 })
    expect(users[bob]).toMatchObject({ money: 19000, stock: 17 })
    expect(users[dee]).toMatchObject({ money: 120, stock: 4 })
    const {
      time: anotherDeletedKey,
      ...timelessPossibleBuyOrder
    } = possibleBuyOrder
    expect(matcher.getBestBuyOrder()).toMatchObject(timelessPossibleBuyOrder)
    expect(matcher.getOverheadMade()).toBe(0)

    matcher.processOrder()

    users = matcher.getUsers()
    expect(users[alice]).toMatchObject({ money: 7500, stock: 76 })
    expect(users[bob]).toMatchObject({ money: 24000, stock: 12 })
    expect(users[dee]).toMatchObject({ money: 120, stock: 4 })
    expect(matcher.getOverheadMade()).toBe(2500)
  })

  it('removes sell orders for accounts without any stock', () => {
    let buyOrder = new Order({
      account: alice,
      price: 1500,
      quantity: 5,
      action: BUY
    })
    let possibleSellOrder = new Order({
      account: bob,
      price: 1000,
      quantity: 5,
      action: SELL
    })
    let impossibleSellOrder = new Order({
      account: charlie,
      price: 100,
      quantity: 1,
      action: SELL
    })
    matcher.addOrder(buyOrder)
    matcher.addOrder(impossibleSellOrder)
    matcher.addOrder(possibleSellOrder)

    matcher.processOrder()

    let users = matcher.getUsers()
    expect(users[alice]).toMatchObject({ money: 15000, stock: 71 })
    expect(users[bob]).toMatchObject({ money: 19000, stock: 17 })
    expect(users[charlie]).toMatchObject({ money: 43000, stock: 0 })

    const {
      time: anotherDeletedKey,
      ...timelessPossibleSellOrder
    } = possibleSellOrder
    expect(matcher.getBestSellOrder()).toMatchObject(timelessPossibleSellOrder)
  })

  it("can return an account's orders", () => {
    let aliceOrder1 = new Order({
      account: alice,
      price: 1500,
      quantity: 5,
      action: BUY
    })
    let aliceOrder2 = new Order({
      account: alice,
      price: 1000,
      quantity: 5,
      action: SELL
    })
    let bobOrder1 = new Order({
      account: bob,
      price: 1000,
      quantity: 5,
      action: SELL
    })

    matcher.addOrder(aliceOrder1)
    matcher.addOrder(aliceOrder2)
    matcher.addOrder(bobOrder1)
    const { time: deletedKey1, ...timelessAliceOrder1 } = aliceOrder1
    const { time: deletedKey2, ...timelessAliceOrder2 } = aliceOrder2
    const { time: deletedKey3, ...timelessBobOrder1 } = bobOrder1

    const aliceOrders = matcher.getOrdersByAccount(alice)
    const bobOrders = matcher.getOrdersByAccount(bob)

    expect(aliceOrders).toContainEqual(
      expect.objectContaining(timelessAliceOrder1)
    )
    expect(aliceOrders).toContainEqual(
      expect.objectContaining(timelessAliceOrder2)
    )
    expect(aliceOrders).not.toContainEqual(
      expect.objectContaining(timelessBobOrder1)
    )

    expect(bobOrders).not.toContainEqual(
      expect.objectContaining(timelessAliceOrder1)
    )
    expect(bobOrders).not.toContainEqual(
      expect.objectContaining(timelessAliceOrder2)
    )
    expect(bobOrders).toContainEqual(
      expect.objectContaining(timelessBobOrder1)
    )
  })

  it('can return the n best buy orders', () => {
    let order1 = new Order({
      account: alice,
      price: 1500,
      quantity: 5,
      action: BUY
    })
    let order2 = new Order({
      account: alice,
      price: 1600,
      quantity: 5,
      action: BUY
    })
    let order3 = new Order({
      account: alice,
      price: 1700,
      quantity: 5,
      action: BUY
    })
    let order4 = new Order({
      account: alice,
      price: 1800,
      quantity: 5,
      action: BUY
    })
    matcher.addOrder(order1)
    matcher.addOrder(order2)
    matcher.addOrder(order3)
    matcher.addOrder(order4)

    const bestBuyOrders = matcher.getBestNBuyOrders(3)
    const { time: deletedKey4, ...timelessOrder4 } = order4
    const { time: deletedKey3, ...timelessOrder3 } = order3
    const { time: deletedKey2, ...timelessOrder2 } = order2

    expect(bestBuyOrders[0]).toMatchObject(timelessOrder4)
    expect(bestBuyOrders[1]).toMatchObject(timelessOrder3)
    expect(bestBuyOrders[2]).toMatchObject(timelessOrder2)
  })

  it('can return the n best sell orders', () => {
    let order1 = new Order({
      account: alice,
      price: 1500,
      quantity: 5,
      action: SELL
    })
    let order2 = new Order({
      account: alice,
      price: 1600,
      quantity: 5,
      action: SELL
    })
    let order3 = new Order({
      account: alice,
      price: 1700,
      quantity: 5,
      action: SELL
    })
    let order4 = new Order({
      account: alice,
      price: 1800,
      quantity: 5,
      action: SELL
    })
    matcher.addOrder(order1)
    matcher.addOrder(order2)
    matcher.addOrder(order3)
    matcher.addOrder(order4)

    const bestSellOrders = matcher.getBestNSellOrders(3)
    const { time: deletedKey1, ...timelessOrder1 } = order1
    const { time: deletedKey2, ...timelessOrder2 } = order2
    const { time: deletedKey3, ...timelessOrder3 } = order3

    expect(bestSellOrders[0]).toMatchObject(timelessOrder1)
    expect(bestSellOrders[1]).toMatchObject(timelessOrder2)
    expect(bestSellOrders[2]).toMatchObject(timelessOrder3)
  })

  it('keeps track of the history of trades', () => {
    let buyOrder1 = new Order({
      account: alice,
      price: 1000,
      quantity: 5,
      action: BUY
    })
    let sellOrder1 = new Order({
      account: bob,
      price: 500,
      quantity: 5,
      action: SELL
    })
    let buyOrder2 = new Order({
      account: bob,
      price: 200,
      quantity: 6,
      action: BUY
    })
    let sellOrder2 = new Order({
      account: alice,
      price: 100,
      quantity: 6,
      action: SELL
    })
    matcher.addOrder(buyOrder1)
    matcher.addOrder(sellOrder1)
    matcher.processOrder()
    matcher.addOrder(buyOrder2)
    matcher.addOrder(sellOrder2)
    matcher.processOrder()

    const history = matcher.getHistory()
    expect(history[0]).toMatchObject({buyer: alice, seller: bob, buyPrice: 1000, sellPrice: 500, quantity: 5})
    expect(history[1]).toMatchObject({buyer: bob, seller: alice, buyPrice: 200, sellPrice: 100, quantity: 6})
  })
})
