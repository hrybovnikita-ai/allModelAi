import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import './Checkout.css';
import './CheckoutDemo.css';
import './CheckoutProduction.css';

const plans = {
  starter: { name:'Free', monthly:0, requests:10, features:['10 requests','Basic models','Chat history'] },
  pro: { name:'Pro', monthly:14.99, requests:500, popular:true, features:['500 requests','Every AI model','AI Arena & Chains','Files and voice mode'] },
  enterprise: { name:'Plus', monthly:29.99, requests:2000, features:['2,000 requests','Priority responses','Personal assistants','Advanced analytics'] },
};
const skills = [
  { icon:'✦', name:'Creative writing', description:'Turn rough ideas into polished stories and campaigns.', link:'/chat?model=claude' },
  { icon:'</>', name:'Code builder', description:'Create, explain, and improve code with an AI pair programmer.', link:'/chat?model=gpt' },
  { icon:'◎', name:'Research lab', description:'Summarize complex topics and discover useful connections.', link:'/chat?model=gemini' },
];

export default function Checkout(){
  const [searchParams]=useSearchParams();
  const initialKey=plans[searchParams.get('plan')]?searchParams.get('plan'):'pro';
  const [planKey,setPlanKey]=useState(initialKey);
  const [billing,setBilling]=useState('monthly');
  const [promo,setPromo]=useState('');
  const [promoApplied,setPromoApplied]=useState(false);
  const [purchased,setPurchased]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState('');
  const [paymentMethod,setPaymentMethod]=useState('card');
  const savedUser=sessionStorage.getItem('allmodelai_user');
  const user=savedUser?JSON.parse(savedUser):null;
  const isDeveloper=user?.email?.toLowerCase()==='hrybovnikita@gmail.com';
  const [purchaseMessage,setPurchaseMessage]=useState('');
  const paymentsEnabled=import.meta.env.VITE_PAYMENTS_ENABLED==='true';
  const plan=plans[planKey];
  const subtotal=billing==='yearly'?plan.monthly*12*.8:plan.monthly;
  const total=promoApplied?subtotal*.8:subtotal;
  const receipt=useMemo(()=>`DEMO-${Date.now().toString().slice(-8)}`,[]);

  const applyPromo=()=>{setPromoApplied(true);setError('');};
  const submitPurchase=async(event)=>{event.preventDefault();setError('');if(!isDeveloper&&!paymentsEnabled){setError('A real payment provider is not connected yet. No money was charged.');return}setSubmitting(true);try{const data=new FormData(event.currentTarget);const response=await fetch('/api/purchases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:user?.name||data.get('name')||'Customer',email:user?.email||data.get('email'),city:data.get('city')||'Developer workspace',dateOfBirth:new Date().toISOString().slice(0,10),plan:planKey,paymentVerified:false})});const result=await response.json();if(!response.ok)throw new Error(result.message);setPurchaseMessage(result.message);setPurchased(true)}catch(requestError){setError(requestError.message)}finally{setSubmitting(false)}};

  if(purchased)return <main className="checkout-page"><nav className="checkout-nav"><Link to="/" className="checkout-brand"><span>AI</span>AllModelAI</Link><Link to="/dashboard">Open dashboard</Link></nav><section className="purchase-success-page"><p className="checkout-eyebrow">Demo payment complete</p><div className="success-mark">✓</div><h1>Your {plan.name} plan is ready.</h1><p>No money was charged. Demo receipt: <strong>{receipt}</strong></p><div className="receipt-card"><span>Plan <b>{plan.name}</b></span><span>Billing <b>{billing}</b></span><span>Demo total <b>${total.toFixed(2)}</b></span></div><div className="skill-grid">{skills.map(skill=><Link className="skill-card" to={skill.link} key={skill.name}><span>{skill.icon}</span><strong>{skill.name}</strong><small>{skill.description}</small><b>Try this skill →</b></Link>)}</div></section></main>;

  return <main className="checkout-page"><nav className="checkout-nav"><Link to="/dashboard" className="checkout-brand"><span>AI</span>AllModelAI</Link><Link to="/dashboard">← Back to dashboard</Link></nav><section className="checkout-layout"><div className="checkout-intro"><p className="checkout-eyebrow">Secure subscription checkout</p><h1>Upgrade your AI workspace.</h1><p>A production-ready payment interface for your users. Transactions are disabled in this local project.</p><div className="billing-toggle"><button className={billing==='monthly'?'active':''} onClick={()=>setBilling('monthly')}>Monthly</button><button className={billing==='yearly'?'active':''} onClick={()=>setBilling('yearly')}>Yearly <small>save 20%</small></button></div><div className="checkout-plan-grid">{Object.entries(plans).filter(([key])=>key!=='starter').map(([key,item])=><button className={planKey===key?'selected':''} onClick={()=>setPlanKey(key)} key={key}>{item.popular&&<i>POPULAR</i>}<span>{item.name}</span><strong>${(billing==='yearly'?item.monthly*.8:item.monthly).toFixed(2)}<small>/mo</small></strong><ul>{item.features.map(feature=><li key={feature}>✓ {feature}</li>)}</ul></button>)}</div></div><form className="checkout-form" onSubmit={submitPurchase} noValidate><div className="payments-disabled"><strong>PAYMENTS DISABLED</strong><span>Local development mode · no real transaction can be created</span></div><div className="secure-row"><span>SECURE CHECKOUT</span><small>🔒 TLS protected</small></div><h2>Payment details</h2><div className="payment-methods">{['card','paypal','apple'].map(method=><button type="button" className={paymentMethod===method?'active':''} onClick={()=>setPaymentMethod(method)} key={method}>{method==='card'?'Credit card':method==='paypal'?'PayPal':'Apple Pay'}</button>)}</div><p className="demo-payment-note">The form is ready for a future payment provider, but local payments remain disabled.</p><label>Name on card<input name="name" autoComplete="cc-name" placeholder="Full name"/></label><label>Billing email<input name="email" type="email" autoComplete="email" placeholder="you@example.com"/></label><label>Card number<div className="card-field"><input name="cardNumber" inputMode="numeric" autoComplete="cc-number" placeholder="1234 5678 9012 3456"/><span>VISA</span></div></label><div className="checkout-form-row"><label>Expiry<input name="expiry" autoComplete="cc-exp" placeholder="MM/YY"/></label><label>CVC<input name="cvc" type="password" inputMode="numeric" autoComplete="cc-csc" placeholder="123"/></label></div><div className="checkout-form-row"><label>Country<select name="country" defaultValue="UA"><option value="UA">Ukraine</option><option value="PL">Poland</option><option value="DE">Germany</option><option value="US">United States</option></select></label><label>Postal code<input name="postalCode" autoComplete="postal-code" placeholder="00000"/></label></div><label>Billing address<input name="address" autoComplete="street-address" placeholder="Street and apartment"/></label><label>City<input name="city" autoComplete="address-level2" placeholder="City"/></label><div className="promo-row"><input value={promo} onChange={e=>setPromo(e.target.value)} placeholder="Promo code"/><button type="button" onClick={applyPromo}>Apply</button></div>{promoApplied&&<p className="promo-success">✓ Discount applied</p>}<label className="checkout-terms"><input type="checkbox"/> <span>I agree to the subscription terms and recurring billing.</span></label><div className="order-total"><span>{plan.name} · {billing}</span><strong>${total.toFixed(2)}</strong></div><button className="pay-button" type="submit" disabled={submitting}>{submitting?'Processing…':`Pay $${total.toFixed(2)}`}</button><small className="checkout-disclaimer">Real payment processing is disabled in this environment</small>{error&&<p className="checkout-error" role="alert">{error}</p>}</form></section></main>;
}
