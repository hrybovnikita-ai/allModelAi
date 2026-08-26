import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-info">
          <div className="footer-brand">AllModelAI</div>
          <p>One platform. All AI models. Unlimited possibilities.</p>
        </div>
        <div className="footer-links">
          <div className="link-group">
            <h4>Product</h4>
            <a href="#models">Models</a>
            <a href="#pricing">Pricing</a>
            <a href="#features">Features</a>
          </div>
          <div className="link-group">
            <h4>Company</h4>
            <a href="#about">About Us</a>
            <a href="#careers">Careers</a>
            <a href="#contact">Contact</a>
          </div>
          <div className="link-group">
            <h4>Legal</h4>
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms of Service</a>
            <a href="/cookies">Cookie Policy</a>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <p>&copy; {new Date().getFullYear()} AllModelAI. All rights reserved.</p>
      </div>
    </footer>
  );
}
