const KEY = 'recent-projects'

export const getRecent = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? []
  } catch {
    return []
  }
}

export function touchRecent(number) {
  const list = [number, ...getRecent().filter((n) => n !== number)].slice(0, 20)
  localStorage.setItem(KEY, JSON.stringify(list))
}
