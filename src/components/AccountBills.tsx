import {useEffect,useRef,useState} from 'react';
import type {Consumption,ConsumptionDetail} from '../../electron/cloud/consumption';
const money=(points:number)=>`¥${(points/10000).toFixed(4)}`;
const date=(value:string)=>new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false,month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const count=(value:number)=>value.toLocaleString('zh-CN');
const amount=(value:number|null)=>value===null?'金额待确认':money(value);
function Computer(){return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 21h8m-4-5v5"/></svg>;}

export function AccountBills({onBack,currentDeviceId}:{onBack:()=>void;currentDeviceId?:string|null}){
  const [range,setRange]=useState<'today'|'week'>('today'),[deviceId,setDeviceId]=useState<string>(),[entryId,setEntryId]=useState<string>(),[page,setPage]=useState(1),[revision,setRevision]=useState(0);
  const [result,setResult]=useState<Consumption|null>(null),[detail,setDetail]=useState<ConsumptionDetail|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [renaming,setRenaming]=useState(false),[name,setName]=useState(''),[saving,setSaving]=useState(false),[renameError,setRenameError]=useState('');
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus();},[deviceId,entryId]);
  useEffect(()=>{let active=true;setLoading(true);setError('');setDetail(null);
    const request=entryId?window.copilotBridge.getConsumption(entryId):window.copilotBridge.listConsumption(range,deviceId,page);
    void request.then(value=>{if(active){if('devices' in value)setResult(value);else setDetail(value);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[range,deviceId,entryId,page,revision]);
  const selected=result?.devices.find(d=>d.id===deviceId);
  const back=()=>{setRenaming(false);setRenameError('');if(entryId)setEntryId(undefined);else if(deviceId){setDeviceId(undefined);setPage(1);}else onBack();};
  const rename=async()=>{if(!deviceId||saving||!name.trim())return;setSaving(true);setRenameError('');try{await window.copilotBridge.renameCloudDevice({id:deviceId,deviceName:name.trim()});setRenaming(false);setRevision(v=>v+1);}catch(e){setRenameError(e instanceof Error?e.message:'修改失败，请重试');}finally{setSaving(false);}};
  return <div className="detail-view account-bills" data-consumption-view={entryId?'detail':deviceId?'device':'overview'}><div className="account-feature-toolbar"><button className="text-action" onClick={back}>‹ {entryId?'返回设备消费':deviceId?'全部设备':'返回账户'}</button><button className="text-action" disabled={loading||saving} onClick={()=>setRevision(v=>v+1)}>刷新</button></div>
    <div className="consumption-scroll" aria-busy={loading}>
      <h3 className={deviceId||entryId?'consumption-title':'visually-hidden'} tabIndex={-1} ref={heading}>{entryId?'消费明细':deviceId?selected?.name??'设备消费':'看看哪台设备用了多少'}</h3>
      {!entryId&&<>{!deviceId&&<p className="consumption-caption">先找到设备，再了解每一笔扣费。时间为北京时间。</p>}<div className="account-segments" aria-label="消费时间范围">{([['today','今天'],['week','近 7 天']] as const).map(([value,label])=><button key={value} aria-pressed={range===value} onClick={()=>{setRange(value);setPage(1);}}>{label}</button>)}</div></>}
      {error?<div className="consumption-empty" role="alert"><strong>暂时无法读取消费记录</strong><p>{error}</p><button className="text-action" onClick={()=>setRevision(v=>v+1)}>重新加载</button></div>:loading?<p className="consumption-empty" role="status">正在读取消费记录…</p>:detail?<>
        <div className="consumption-hero centered"><span>{detail.kind==='HISTORICAL'?'历史消费汇总':'实际扣费'}</span><strong>{amount(detail.chargedPoints)}</strong><small>{detail.chargedPoints===null?'计费待核对':detail.status==='UNPAID'?'已扣部分余额 · 费用未全部扣除':detail.chargedPoints===0?'本次未扣费':'已从余额扣除'}</small></div>
        <dl className="consumption-facts"><div><dt>来自设备</dt><dd>{detail.deviceName}{detail.deviceId===currentDeviceId?' · 本机':''}</dd></div><div><dt>{detail.kind==='HISTORICAL'?'历史汇总归集时间':'扣费记录时间'}</dt><dd>{date(detail.occurredAt)}</dd></div><div><dt>使用模型</dt><dd>{detail.model??'历史数据未记录'}</dd></div></dl>
        <section className="consumption-explanation"><h4>{detail.chargedPoints===null?'为什么还没有金额？':'这笔钱是怎么扣的？'}</h4><p>{detail.chargedPoints===null?'本次调用的计量或计价信息需要核对，金额尚无法确认，因此不会显示为 0 元。':detail.kind==='HISTORICAL'?'这是该设备缺少逐笔明细的历史实际扣款合计，可能跨越多个时间区间。归集时间不代表消费发生时间，汇总展示不会再次扣费。':`这台设备调用了 ${detail.model}。费用按模型处理输入内容、生成回复的实际用量计算。输入可包含本次消息、历史对话及客户端发送的上下文，并不只计算刚输入的文字。`}</p>
          {detail.usage&&<div className="consumption-portions"><div><span>处理输入内容</span><b>{detail.breakdown?money(detail.breakdown.inputPoints):'按实际输入用量计费'}</b><small>包含消息、上下文及缓存输入</small></div><div><span>生成回复</span><b>{detail.breakdown?money(detail.breakdown.outputPoints):'按实际输出用量计费'}</b><small>包含回复及模型思考用量</small></div></div>}
        </section>
        {detail.status==='UNPAID'&&<p className="consumption-notice">余额不足，本次仅扣除了 {money(detail.chargedPoints??0)}。应计费用 {detail.ratedPoints===null?'待确认':money(detail.ratedPoints)}，两者不能视为相同。</p>}
        {detail.kind==='HISTORICAL'&&<p className="consumption-notice">只有历史汇总，无法还原每次调用的模型、时间和用量。</p>}
        <details className="consumption-pricing"><summary>计费明细</summary>{detail.usage?<><dl className="consumption-facts">{([['inputTokens','输入用量'],['cachedInputTokens','其中缓存输入'],['outputTokens','输出用量'],['reasoningTokens','其中思考用量'],['imageInput','图片输入'],['imageOutput','图片输出'],['toolCalls','工具调用']] as const).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{count(detail.usage![key])}{key.endsWith('Tokens')?' tokens':' 次'}</dd></div>)}</dl><p>缓存属于输入，思考属于输出，不重复相加。</p></>:null}
          {detail.rates?<><dl className="consumption-facts">{([['inputRate','普通输入'],['cachedInputRate','缓存输入'],['outputRate','普通输出'],['reasoningRate','思考用量']] as const).map(([key,label])=><div key={key}><dt>{label} / 百万 tokens</dt><dd>¥{(Number(detail.rates![key])/10).toFixed(4)}</dd></div>)}{([['imageInputRate','图片输入'],['imageOutputRate','图片输出'],['toolRate','工具调用']] as const).map(([key,label])=><div key={key}><dt>{label} / 次</dt><dd>{money(Number(detail.rates![key]))}</dd></div>)}<div><dt>单次最低计费</dt><dd>{money(detail.rates.minimumCharge)}</dd></div></dl><p>按本次调用保存的费率版本计价，合计向上取整至 ¥0.0001，并应用单次最低计费。</p></>:<p>{detail.kind==='HISTORICAL'?'历史记录没有可核对的逐笔计费依据。':'本条记录暂不能完整解释单价调整，暂不提供费用拆分；实际扣款以本页金额为准。'}</p>}
          <p>一次模型调用不等于一次完整任务。已扣费记录无需等待区间归集，归集不会重复扣款。</p>
        </details>
      </>:result&&<>
        <div className="consumption-hero"><span>{range==='today'?'今天':'近 7 天'}已扣费</span><strong>{money(result.chargedPoints)}</strong><small>{deviceId?'来自这台设备':'按设备汇总实际扣款'}</small></div>
        {result.reviewCount>0&&<details className="consumption-review"><summary>{result.reviewCount} 条记录需要核对</summary><p>未确认的金额未计入合计，部分扣款按实际已扣金额计入。</p></details>}
        {deviceId?<>
          <div className="consumption-section-title"><h4>消费明细</h4><button className="text-action" onClick={()=>{setName(selected?.name??'');setRenaming(v=>!v);setRenameError('');}}>修改设备名称</button></div>
          {renaming&&<form className="consumption-rename" onSubmit={e=>{e.preventDefault();void rename();}}><label htmlFor="consumption-device-name">设备名称</label><input id="consumption-device-name" value={name} onChange={e=>setName(e.target.value)} maxLength={80} disabled={saving}/><button disabled={saving||!name.trim()}>保存</button><button type="button" disabled={saving} onClick={()=>setRenaming(false)}>取消</button>{renameError&&<p role="alert">{renameError}</p>}</form>}
          <div className="consumption-table-label"><span>时间 / 模型</span><span>实际扣费</span></div>
          {result.data.map(row=><button className="consumption-call" key={row.id} onClick={()=>setEntryId(row.id)}><span className="consumption-row-copy"><b>{row.model??'历史消费汇总'}</b><small>{date(row.occurredAt)}{row.kind==='HISTORICAL'?' · 归集时间':row.needsReview?' · 计费待核对':''}</small></span><span className="consumption-row-amount">{amount(row.chargedPoints)}<span aria-hidden="true"> ›</span></span></button>)}
          {result.total>0&&<div className="account-feature-pagination"><span>{result.total} 条 · 第 {page} / {Math.max(1,Math.ceil(result.total/result.pageSize))} 页</span><div><button disabled={page<=1} onClick={()=>setPage(v=>v-1)}>上一页</button><button disabled={page*result.pageSize>=result.total} onClick={()=>setPage(v=>v+1)}>下一页</button></div></div>}
          <p className="consumption-caption">一项操作可能产生多次模型调用，记录按调用展示。</p>
        </>:<><div className="consumption-section-title"><h4>我的设备</h4><span>{result.devices.length} 台有记录</span></div>{result.devices.map(device=><button className="consumption-device" key={device.id} onClick={()=>{setDeviceId(device.id);setPage(1);}}><span className="consumption-device-icon"><Computer/></span><span className="consumption-row-copy"><b>{device.name}{device.id===currentDeviceId&&<em>本机</em>}</b><small>{device.platform} · 最近记录 {date(device.lastUsedAt)}</small></span><span className="consumption-row-amount">{device.reviewCount&&device.chargedPoints===0?'金额待确认':money(device.chargedPoints)}<span aria-hidden="true"> ›</span></span></button>)}</>}
        {(deviceId?result.total===0:result.devices.length===0)&&<div className="consumption-empty"><Computer/><strong>这段时间还没有消费记录</strong><p>发生消费后，会按设备显示在这里。</p>{range==='today'&&<button className="text-action" onClick={()=>{setRange('week');setPage(1);}}>看看近 7 天</button>}</div>}
        <details className="consumption-pricing"><summary>扣费说明</summary><p>余额按每次调用的实际用量扣减。设备上线后的区间归集只是整理记录，不会再扣一次。充值、奖励和管理员调整不计入消费。</p><p>“金额待确认”表示计量或计价需要核对，不代表免费。历史汇总只在缺少逐笔记录时显示，可能包含更早的消费。</p></details>
      </>}
    </div>
  </div>;
}
