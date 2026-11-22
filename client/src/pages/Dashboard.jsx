import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Landmark, Grid3x3, CheckCircle2, Clock, BadgeCheck, Users, TrendingUp, Wallet, AlertCircle, CalendarDays, CalendarRange, ShoppingCart, PiggyBank, PlusCircle, Receipt } from 'lucide-react';
import { useApi } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { area, date, pkr, shortPkr, num, STATUS, sqft } from '../lib/format.js';
import { Card, ErrorBox, Loading, PageHeader, StatCard, StatusBadge, Empty } from '../components/ui.jsx';

export default function Dashboard() {
  const { user, can } = useAuth();
  const { data: d, isLoading, error } = useApi('/dashboard');
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const f = d.finance;
  const p = d.plots;
  const hello = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <>
      <PageHeader title={`${hello}, ${user.full_name.split(' ')[0]}`} subtitle={`Today is ${date(d.today)}`}
        actions={<>
          {can('booking.create') && <Link to="/bookings/new" className="btn-gold"><PlusCircle className="h-4 w-4" />New Booking</Link>}
          {can('payment.create') && <Link to="/collect" className="btn-primary"><Wallet className="h-4 w-4" />Collect Payment</Link>}
        </>} />
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <StatCard icon={Landmark} label="Total Land Area" value={area(d.land.marla)} sub={`${sqft(d.land.sqft)} · ${d.land.count} land record(s)`} to={can('land.view') ? '/lands' : undefined} />
        <StatCard icon={Grid3x3} label="Total Plots" value={num(p.total)} sub={`${num(p.plotted_marla)} Marla plotted`} to="/plots" />
        <StatCard icon={CheckCircle2} tone="green" label="Available Plots" value={num(p.available)} sub={`${p.reserved} reserved`} to="/plots?status=AVAILABLE" />
        <StatCard icon={Clock} tone="blue" label="Booked Plots" value={num(p.booked + p.transferred)} sub={`${p.transferred} transferred, installments running`} to="/plots?status=BOOKED,TRANSFERRED" />
        <StatCard icon={BadgeCheck} tone="red" label="Sold Plots" value={num(p.sold)} sub="Fully paid" to="/plots?status=SOLD" />
        <StatCard icon={Users} tone="violet" label="Total Customers" value={num(d.customers)} sub={`${d.overdue_customers} with overdue dues`} to="/customers" />
        {f && <>
          <StatCard icon={TrendingUp} tone="gold" label="Total Sales" value={shortPkr(f.total_sales)} sub={pkr(f.total_sales)} to="/reports?r=sales" />
          <StatCard icon={Wallet} tone="green" label="Total Amount Received" value={shortPkr(f.total_received)} sub={`${pkr(f.collected_on_sales)} against sales`} to="/receipts" />
          <StatCard icon={AlertCircle} tone="red" label="Total Outstanding" value={shortPkr(f.outstanding)} sub={`Overdue: ${pkr(f.overdue)}`} to="/installments" />
          <StatCard icon={CalendarDays} tone="blue" label="Today's Collections" value={pkr(f.today_collections)} sub={`${f.today_count} receipt(s)`} to="/reports?r=daily-cash" />
          <StatCard icon={CalendarRange} tone="navy" label="Monthly Collections" value={shortPkr(f.month_collections)} sub={`${f.month_count} receipt(s) this month`} to="/reports?r=collections" />
          <StatCard icon={ShoppingCart} tone="slate" label="Total Expenses" value={shortPkr(f.total_expenses)} sub="Excluding payments to land owners" to="/expenses" />
          <StatCard icon={PiggyBank} tone={f.net_profit >= 0 ? 'green' : 'red'} label="Net Profit (realised)" value={shortPkr(f.net_profit)} sub="Installment method · see Financial Summary" to="/reports?r=summary" />
        </>}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        {d.months && (
          <Card title="Collections vs expenses (last 12 months)" className="xl:col-span-2">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.months} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={(m) => m.slice(5) + '/' + m.slice(2, 4)} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => shortPkr(v).replace('Rs ', '')} width={70} />
                  <Tooltip formatter={(v) => pkr(v)} labelFormatter={(m) => m} />
                  <Legend />
                  <Bar dataKey="collections" name="Collections" fill="#0b2545" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#d4af37" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
        <Card title="Plot status" className={d.months ? '' : 'xl:col-span-3'}>
          {['AVAILABLE', 'RESERVED', 'BOOKED', 'TRANSFERRED', 'SOLD', 'CANCELLED'].map((s) => {
            const n = { AVAILABLE: p.available, RESERVED: p.reserved, BOOKED: p.booked, TRANSFERRED: p.transferred, SOLD: p.sold, CANCELLED: p.withdrawn }[s];
            const all = p.total + p.withdrawn || 1;
            return (
              <Link key={s} to={`/plots?status=${s}`} className="mb-3 block">
                <div className="mb-1 flex justify-between text-sm"><span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${STATUS[s].dot}`} />{STATUS[s].label}</span><span className="font-semibold tabular-nums">{n}</span></div>
                <div className="h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${STATUS[s].dot}`} style={{ width: `${(n / all) * 100}%` }} /></div>
              </Link>
            );
          })}
          <Link to="/plot-map" className="btn-secondary mt-2 w-full">Open plot map</Link>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title={`Installments due in next 30 days (${d.upcoming.count})`} actions={<Link to="/installments" className="text-sm font-semibold text-navy-700 hover:underline">View all</Link>} bodyClass="p-0">
          {d.due_soon.length ? (
            <table className="min-w-full divide-y divide-slate-100"><tbody className="divide-y divide-slate-100">
              {d.due_soon.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="td whitespace-nowrap">{date(r.due_date)}</td>
                  <td className="td"><Link className="font-medium text-navy-800 hover:underline" to={`/bookings/${r.booking_id}`}>{r.customer_name}</Link><div className="text-xs text-slate-500">Plot {r.plot_no} · {r.mobile}</div></td>
                  <td className="td num font-semibold">{pkr(r.due)}</td>
                </tr>
              ))}
            </tbody></table>
          ) : <Empty text="No installments due in the next 30 days." />}
          <div className="border-t border-slate-100 px-4 py-2 text-sm text-slate-600">Total due: <b>{pkr(d.upcoming.amount)}</b></div>
        </Card>
        {d.recent_payments && (
          <Card title="Recent receipts" actions={<Link to="/receipts" className="text-sm font-semibold text-navy-700 hover:underline">All receipts</Link>} bodyClass="p-0">
            {d.recent_payments.length ? (
              <table className="min-w-full divide-y divide-slate-100"><tbody className="divide-y divide-slate-100">
                {d.recent_payments.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="td whitespace-nowrap"><Link to={`/receipts/${r.id}`} className="inline-flex items-center gap-1 font-medium text-navy-800 hover:underline"><Receipt className="h-3.5 w-3.5" />{r.receipt_no}</Link><div className="text-xs text-slate-500">{date(r.payment_date)}</div></td>
                    <td className="td">{r.customer_name}<div className="text-xs text-slate-500">Plot {r.plot_no}</div></td>
                    <td className="td num"><div className="font-semibold">{pkr(r.amount)}</div>{r.status !== 'VALID' && <StatusBadge status={r.status} />}</td>
                  </tr>
                ))}
              </tbody></table>
            ) : <Empty text="No payments yet." />}
          </Card>
        )}
      </div>
    </>
  );
}
