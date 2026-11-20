/** অর্ডার ঝুঁকির স্কোর (০–১০০, বেশি = বেশি ঝুঁকি)। সাধারণ ওজনভিত্তিক হিসাব, কারণসহ। */
export function scoreOrder({ price, charge, address, successRatio = 0.7, hourBd, newBuyer }) {
  const night = hourBd >= 23 || hourBd <= 5;
  let p = 0.12 + 0.4 * (1 - successRatio);
  const reasons = [];
  if (address.trim().length < 15) { p += 0.15; reasons.push("address incomplete"); }
  if (price > 5000) { p += 0.1; reasons.push("high order value"); }
  if (night) { p += 0.1; reasons.push("placed at night"); }
  if (successRatio < 0.6) reasons.push("low courier success ratio");
  if (newBuyer) { p += 0.05; reasons.push("new buyer"); }
  if (charge > price) { p += 0.05; reasons.push("charge higher than price"); }
  return { score: Math.round(Math.min(Math.max(p, 0), 1) * 100), reasons };
}
