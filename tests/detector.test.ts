import rewire from "rewire"
const detector = rewire("../src/detector")
const getDate = detector.__get__("getDate")
// @ponicode
describe("getDate", () => {
    test("0", () => {
        let result: any = getDate({ state: "run", finished: "canceled", id: "7289708e-b17a-477c-8a77-9ab575c4b4d8", team: "JC1", duration: 600, field: 1, guestClub: "Phoenix", guestTeam: "JB1", startDate: "2018-01-01", startTime: "12:30", oldRow: "" })
        expect(result).toBe("Jan 1")
    })

    test("1", () => {
        let result: any = getDate({ state: "run", finished: "canceled", id: "7289708e-b17a-477c-8a77-9ab575c4b4d8", team: "JC1", duration: 600, field: 1, guestClub: "Phoenix", guestTeam: "JB1", startDate: "2020-11-22", startTime: "12:30", oldRow: "" })
        expect(result).toBe("Nov 22")
    })

    test("2", () => {
        let result: any = getDate({ state: "run", finished: "processed", id: "7289708e-b17a-477c-8a77-9ab575c4b4d8", team: "JB1", duration: 6000, field: 1, guestClub: "Geel-Zwart", guestTeam: "JB1", startDate: "2021-11-06", startTime: "12:30", oldRow: "" })
        expect(result).toBe("Nov 6")
    })
})
