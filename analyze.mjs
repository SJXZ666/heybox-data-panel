// 用抓到的数据生成一份「自媒体数据分析师」视角的报告
// 用法：node analyze.mjs   （config.json 填了 apiKey 才会真的调用模型；没填就只输出提示词）
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const dataFile = join(HERE, 'data.json')
if (!existsSync(dataFile)) { console.error('先运行 抓取.cmd'); process.exit(1) }

const data = JSON.parse(readFileSync(dataFile, 'utf8'))
const excludeFile = join(HERE, 'exclude.json')
const excluded = new Set(
  (existsSync(excludeFile) ? (JSON.parse(readFileSync(excludeFile, 'utf8')).ids || []) : []).map(Number)
)
const rows = data.rows
  .filter(r => r.title && !excluded.has(Number(r.id)))
  .sort((a, b) => b.date.localeCompare(a.date))
const cfg = existsSync(join(HERE, 'config.json')) ? JSON.parse(readFileSync(join(HERE, 'config.json'), 'utf8')) : {}
const apiKey = cfg.apiKey || process.env.DEEPSEEK_API_KEY || ''
const model = cfg.model || 'deepseek-chat'

const sum = k => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0)
const total = { views: sum('views'), likes: sum('likes'), comments: sum('comments'), shares: sum('shares'), favorites: sum('favorites'), battery: sum('battery') }
const avg = k => rows.length ? Math.round((sum(k) / rows.length) * 10) / 10 : 0

// ---- 时间维度：最近两周为重点，早期只做对照 ----
const now = Date.now()
const DAY = 864e5
const at = (r) => new Date(r.date + 'T12:00:00').getTime()
const recent = rows.filter((r) => now - at(r) <= 14 * DAY)
const prev = rows.filter((r) => now - at(r) > 14 * DAY && now - at(r) <= 30 * DAY)
const older = rows.filter((r) => now - at(r) > 30 * DAY)
const eng = (r) => (Number(r.likes) || 0) + (Number(r.favorites) || 0) + (Number(r.comments) || 0)
const rate = (r) => (Number(r.views) > 0 ? eng(r) / Number(r.views) : 0)
const avgOf = (list) => (list.length ? Math.round(list.reduce((a, r) => a + (Number(r.views) || 0), 0) / list.length) : 0)
const avgRate = (list) => (list.length ? Math.round((list.reduce((a, r) => a + rate(r), 0) / list.length) * 1000) / 10 : 0)

const table = ['标题|日期|浏览|点赞|评论|收藏|充电|互动率%|曝光',
  ...recent.slice(0, 15).map((r) => [r.title, r.date, r.views, r.likes, r.comments, r.favorites, r.battery, (rate(r) * 100).toFixed(1), r.exposure].join('|'))].join('\n')


const bodiesFile = join(HERE, 'bodies.json')
const bodies = existsSync(bodiesFile) ? JSON.parse(readFileSync(bodiesFile, 'utf8')) : {}
const bodyOf = (r) => {
  const b = bodies[String(r.id)] || bodies[Number(r.id)]
  return b && b.text ? String(b.text) : ''
}
const excerpts = recent.slice(0, 10).map((r) => {
  const t = bodyOf(r).replace(/\s+/g, ' ').trim()
  if (t.length < 40) return ''
  const head = t.slice(0, 180)
  const tail = t.length > 380 ? t.slice(-140) : ''
  return `《${r.title}》\n开头：${head}${tail ? `\n结尾：${tail}` : ''}`
}).filter(Boolean).join('\n\n')

const months = new Map()
for (const r of rows) {
  const k = String(r.date || '').slice(0, 7)
  if (!k) continue
  const o = months.get(k) || { k, posts: 0, views: 0, eng: 0 }
  o.posts += 1
  o.views += Number(r.views) || 0
  o.eng += rate(r)
  months.set(k, o)
}
const monthRows = [...months.values()].sort((a, b) => a.k.localeCompare(b.k)).slice(-6)
const monthTable = ['月份|篇数|篇均浏览|篇均互动率%',
  ...monthRows.map((m) => [m.k, m.posts, Math.round(m.views / Math.max(1, m.posts)), (Math.round((m.eng / Math.max(1, m.posts)) * 1000) / 10)]).join('|')].join('\n')

const topEarly = [...older].sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0)).slice(0, 3)
  .map((r) => `${r.title}（${r.views}）`).join('；')

const prompt = `你是一位在游戏内容平台做了八年的自媒体数据分析师，服务对象是一个小黑盒账号。你的任务不是夸人，是用数据指出这个账号真正的问题和下一步该做什么。

【账号近 ${rows.length} 篇数据】${excluded.size ? `（另有 ${excluded.size} 篇被作者排除，不计入统计）` : ''}
- 最近两周：${recent.length} 篇，篇均浏览 ${avgOf(recent)}，篇均互动率 ${avgRate(recent)}%
- 前两周：${prev.length} 篇，篇均浏览 ${avgOf(prev)}，篇均互动率 ${avgRate(prev)}%
- 30 天以前：${older.length} 篇，篇均浏览 ${avgOf(older)}，篇均互动率 ${avgRate(older)}%（只作参照，不要逐篇点评）

【最近两周逐篇】
${table || '（最近两周没有发布）'}

${excerpts ? `【正文片段（只用于引用证据和示范改写）】\n${excerpts}\n` : ''}【按月趋势（近 6 个月）】
${monthTable}

【早期作品概览（仅对比用）】
${older.length ? `共 ${older.length} 篇，浏览最高的是：${topEarly}。` : '无'}

【汇总】
- 总浏览 ${total.views}，总点赞 ${total.likes}，总评论 ${total.comments}，总分享 ${total.shares}，总收藏 ${total.favorites}，总充电 ${total.battery}
- 篇均浏览 ${avg('views')}，篇均点赞 ${avg('likes')}，篇均评论 ${avg('comments')}

【写作要求】
这份报告的重心是「最近怎么样、和之前比变好还是变差」，不是把历史作品挨个点评一遍。
- 至少 70% 的篇幅写最近两周；早期作品只在解释趋势时提一句，禁止逐篇点评早期作品。
- 必须单独回答「质量随时间怎么变」：用最近两周对比前两周（篇均浏览、篇均互动率），判断上升、下降还是停滞，并给出具体数字。
- 必须点名最近 5 篇，每篇一句话：好在哪、问题在哪。
- 每个问题都必须带证据：从【正文片段】里原样复制一句（用「」标出，可截断，但不能改写、不能编造），说明这句话为什么没留住人。
- 解决方向必须给案例：挑最近两周的一篇，按你给的方法把它的开头或结尾改写一版（不超过 80 字），并注明改的是哪一篇、为什么这么改。
- 每条动作都要落到具体写法（开头怎么写、结尾怎么收、标题怎么改），不要只说「提高互动」。
- 结构：
  1. 三句话结论（第一句就要说趋势：比之前好还是差）。
  2. 时间趋势：分「最近两周 / 前两周 / 更早」三段对比，指出变化发生在哪类题材上。
  3. 最近 5 篇逐篇短评。
  4. 两类问题各点 1–2 篇，优先从最近两周里选：高曝光低点击（标题/封面）、高浏览低互动（没留讨论点）。
  5. 解决方向和示范：选最近两周的两篇（一篇高曝光低互动、一篇低曝光），各给一处改写示范（开头或结尾，不超过 80 字），写清原文哪句有问题、改成什么、为什么这么改。
  6. 互动结构：点赞率、收藏率、评论率、充电分别说明信号，哪类题材更高。
  7. 下周 5 条可执行动作，每条写清：做什么、针对哪类文章、预期改善哪个指标。
  8. 最后一行给一个「如果只改一件事」的建议。
- 用中文，不要用「综上所述」「随着」这类词，不要写空话。
- 只允许引用上面给的数据和标题，不要编造。
`

writeFileSync(join(HERE, '分析提示词.md'), prompt, 'utf8')

async function callModel(p) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: '你是一位严格、具体的自媒体数据分析师。只说数据能支持的结论，拒绝套话。' },
        { role: 'user', content: p },
      ],
      temperature: 0.4,
      max_tokens: 8000,
      // V4.1 Flash 默认会先「想」很久，把 token 花在 reasoning 上，正文经常是空的；分析报告不需要这层思考
      thinking: { type: 'disabled' },
    }),
  })
  const j = await res.json()
  if (!res.ok) throw new Error(j.error?.message || `HTTP ${res.status}`)
  const text = j.choices?.[0]?.message?.content || ''
  if (!text.trim()) {
    const reasoning = j.choices?.[0]?.message?.reasoning_content || ''
    throw new Error(reasoning ? '模型把 token 都花在思考上了，正文是空的（已把上限提到 8000，还空就再调大）' : '模型返回了空内容')
  }
  return text
}

const corpus = excerpts.replace(/\s+/g, '')
function badQuotes(text) {
  const qs = [...String(text).matchAll(/「([^」]{8,90})」/g)].map((m) => m[1].replace(/\s+/g, ''))
  return qs.filter((q) => !corpus.includes(q.slice(0, 24)))
}

const promptOnly = process.argv.includes('--prompt-only')
if (!apiKey || promptOnly) {
  console.log('没有配置 apiKey：已生成 分析提示词.md')
  console.log('把提示词贴给任意模型即可；或在 config.json 里填 apiKey 后重跑，会自动生成 分析报告.md')
  process.exit(0)
}

try {
  let text = await callModel(prompt)
  const bad = badQuotes(text)
  if (bad.length) {
    console.log('发现引用不在正文里，重写一次：', bad.slice(0, 3).join(' / '))
    const fix = prompt + `\n\n【重要修正】上一稿里这些引用在正文片段中不存在：${bad.slice(0, 3).map((q) => '「' + q + '」').join('、')}。引用必须从【正文片段】里原样复制（可截断，不可改写、不可编造），请重写整份报告。`
    text = await callModel(fix)
  }
  const head = `# 小黑盒账号数据分析（${new Date().toLocaleString('zh-CN')}）\n\n> 数据：${rows.length} 篇，总浏览 ${total.views}，总点赞 ${total.likes}，总评论 ${total.comments}\n\n`
  writeFileSync(join(HERE, '分析报告.md'), head + text, 'utf8')
  console.log('已生成 分析报告.md')
} catch (err) {
  console.error('调用模型失败：', err.message)
  console.error('提示词已保存在 分析提示词.md')
  process.exit(1)
}
