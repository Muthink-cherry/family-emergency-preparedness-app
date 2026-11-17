const REFERENCE_ITEMS = [
  ['water','飲水','居家飲用水','L','P1'],
  ['filter','飲水','便攜式濾水器','個','P2'],
  ['shelf-food','食物','常溫即食食品','份','P1'],
  ['snacks','食物','耐放點心','份','P2'],
  ['stove','烹煮','卡式爐','台','P2'],
  ['fuel','烹煮','備用燃料','罐','P2'],
  ['flashlight','照明','手電筒或頭燈','支','P1'],
  ['batteries','電力','備用電池','組','P1'],
  ['power','電力','行動電源與充電線','組','P1'],
  ['first-aid','醫療','基礎急救用品','組','P1'],
  ['personal-med','醫療','個人必要藥品','組','P1'],
  ['hygiene','衛生','衛生用品與垃圾袋','組','P1'],
  ['blanket','衣物','保暖毯與替換衣物','組','P2'],
  ['contact','文件','聯絡卡與重要文件副本','份','P1'],
  ['radio','資訊','收音機','台','P2'],
  ['whistle','工具','哨子','個','P2']
];

function makeStarterState(days) {
  return {
    settings:{home_goal_days:days,water_l_per_person_day:3,prep_start_on:todayISO(),prep_end_on:addDays(todayISO(),30)},
    categories:[...new Set(REFERENCE_ITEMS.map(([,category])=>category))],
    items:REFERENCE_ITEMS.map(([id,category,name,unit,priority])=>({id,category,name,unit,priority,scope:'home',status:'considering'})),
    members:[],go_bags:[],bag_checklist:[],inventory_batches:[],history:[],
    home_stages:[3,7,10,14].map(days=>({days,label:`${days} 天`})),
    household_tasks:[
      ['water-audit','盤點飲水','記錄實際庫存、存放位置和效期'],
      ['food-audit','盤點食物','確認保存方式、食用方式和效期'],
      ['no-cook','準備免煮餐','安排家庭成員可食用的常溫餐食'],
      ['toilet-test','準備衛生備品','確認用品與處理方式'],
      ['bags','試背避難包','確認每包的重量、位置和背負人'],
      ['power-test','檢查照明與電力','檢查電池、充電線與備用照明'],
      ['roles','確認家庭分工','確認照顧、聯絡和物資分工'],
      ['routes','規劃集合地點','記錄集合點與替代路線'],
      ['drill','完成一次家庭演練','一起檢查清單並補足缺項']
    ].map(([id,title,acceptance])=>({id,title,acceptance,priority:'P1',status:'todo'}))
  };
}
