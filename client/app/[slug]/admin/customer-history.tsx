import { Button, Empty, Tag } from 'antd';
import { CalendarOutlined, CarOutlined, DashboardOutlined, FileTextOutlined, HistoryOutlined, PhoneOutlined, PlusOutlined, QrcodeOutlined, ShoppingOutlined } from '@ant-design/icons';
import { visitDate, paymentLabel, amountInCents, type Visit, type VehicleHistory } from '../../lib/customers';
import { formatPrice } from '../../lib/products';
import './customer-history.css';

export default function CustomerHistory({ history, onAdd, onCharge, onShare }: { history: VehicleHistory; onAdd: () => void; onCharge: (visit: Visit) => void; onShare: () => void }) {
  const latest = history.visitas[0];
  const mileage = history.visitas.find((visit) => visit.kilometraje !== null)?.kilometraje;
  const vehicle = [history.marca, history.modelo].filter(Boolean).join(' ') || 'Vehículo registrado';
  const pending = history.visitas.filter((visit) => visit.monto !== null && !visit.metodoPago && amountInCents(visit.monto) > 0);
  const pendingCents = pending.reduce((total, visit) => total + amountInCents(visit.monto!), 0);
  const unknown = history.visitas.filter((visit) => visit.monto === null).length;

  return <div className="customer-history-content">
    <section className="customer-summary" aria-label="Ficha del cliente y vehículo">
      <div className="history-identity">
        <span className="history-vehicle-icon"><CarOutlined /></span>
        <div className="history-identity-copy"><span className="history-eyebrow">CLIENTE Y VEHÍCULO</span><h2>{history.nombre}</h2><p>{vehicle}</p></div>
        <Tag className="customer-plate">{history.patente}</Tag>
      </div>
      <div className="history-summary-actions">
        {history.telefono ? <a className="history-phone" href={`tel:${history.telefono.replace(/[^\d+]/g, '')}`}><PhoneOutlined /><span>{history.telefono}</span></a> : <span className="history-no-phone">Sin teléfono registrado</span>}
        <div className="history-action-buttons"><Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>Agregar atención</Button><Button icon={<QrcodeOutlined />} onClick={onShare}>QR del cliente</Button></div>
      </div>
    </section>

    <dl className="history-overview" aria-label="Resumen de atenciones">
      <div><dt><HistoryOutlined /> Atenciones</dt><dd>{history.visitas.length}<small>en total</small></dd></div>
      <div><dt><CalendarOutlined /> Última visita</dt><dd>{latest ? visitDate(latest.fecha) : 'Sin visitas'}</dd></div>
      <div><dt><DashboardOutlined /> Último kilometraje</dt><dd>{mileage != null ? <>{mileage.toLocaleString('es-AR')}<small>km</small></> : 'Sin registrar'}</dd></div>
    </dl>

    <div className={`history-balance${pending.length ? ' has-pending' : ''}`}><div><span>Pendiente a cobrar</span><strong>{formatPrice((pendingCents / 100).toFixed(2))}</strong></div><span>{pending.length ? `${pending.length} ${pending.length === 1 ? 'atención pendiente' : 'atenciones pendientes'}` : 'Sin pagos pendientes registrados'}{unknown > 0 && <small>{unknown} {unknown === 1 ? 'atención sin monto definido' : 'atenciones sin monto definido'}</small>}</span></div>
    <section className="history-records" aria-label="Atenciones realizadas">
      <div className="history-section-heading"><h3>Historial de atenciones</h3><span>Más recientes primero</span></div>
      {history.visitas.length ? <ol className="history-cards">{history.visitas.map((item, index) => <li className="customer-visit" key={item.id}>
        <div className="history-visit-heading"><span className="customer-visit-date"><CalendarOutlined /><time dateTime={item.fecha}>{visitDate(item.fecha)}</time></span>{index === 0 && <Tag className="history-latest-tag">Más reciente</Tag>}</div>
        <h3>{item.servicio}</h3>
        {item.kilometraje !== null && <span className="history-mileage"><DashboardOutlined />{item.kilometraje.toLocaleString('es-AR')} km</span>}
        <div className="history-products"><h4><ShoppingOutlined /> Productos utilizados</h4><div className="customer-visit-products">{item.productos.length ? item.productos.map((product) => <Tag key={product}>{product}</Tag>) : <span>No se utilizaron productos en esta atención.</span>}</div></div>
        {item.observaciones && <div className="history-notes"><span><FileTextOutlined /> Observaciones</span><p>{item.observaciones}</p></div>}
        <div className="history-charge"><div><span>Total de la atención</span><strong>{item.monto !== null ? formatPrice(item.monto) : 'Monto sin registrar'}</strong><Tag color={item.metodoPago ? 'green' : item.monto !== null && amountInCents(item.monto) === 0 ? 'default' : 'orange'}>{item.metodoPago ? `Pagado · ${paymentLabel(item.metodoPago)}` : item.monto !== null && amountInCents(item.monto) === 0 ? 'Sin cargo' : item.monto === null ? 'Sin monto definido' : 'Pendiente de pago'}</Tag></div>{!item.metodoPago && (item.monto === null || amountInCents(item.monto) > 0) && <Button className="history-charge-button" onClick={() => onCharge(item)}>Cobrar atención</Button>}</div>
      </li>)}</ol> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Todavía no hay atenciones. Agregá la primera para comenzar el historial." />}
    </section>
  </div>;
}
