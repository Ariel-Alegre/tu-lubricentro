import { StarOutlined, ExportOutlined } from '@ant-design/icons';
import './google-reviews.css';

export default function GoogleReviews({ url }: { url?: string }) {
  if (!url) return null;
  return <section className="google-reviews-card" aria-label="Reseñas de Google">
    <StarOutlined className="google-reviews-star" />
    <div><h2>¿Cómo fue tu experiencia?</h2><p>Compartí tu opinión sobre el lubricentro en Google.</p></div>
    <a href={url} target="_blank" rel="noopener noreferrer">Dejar una reseña en Google <ExportOutlined /></a>
  </section>;
}
