import AllModelAILogo from '../AllModelAILogo/AllModelAILogo';
import WindowsDownloadButton from '../Download/WindowsDownloadButton';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer footer--premium">
      <div className="footer-ambient" aria-hidden="true" />

      <div className="footer-inner">
        <div className="footer-shell">
          <div className="footer-shell-border" aria-hidden="true" />
          <div className="footer-shell-inner">
            <div className="footer-content">
              <div className="footer-info">
                <AllModelAILogo
                  size={40}
                  className="footer-brand-lockup"
                  textClassName="footer-brand-text"
                />
                <p className="footer-tagline">One platform. All AI models. Unlimited possibilities.</p>
                <WindowsDownloadButton variant="footer" className="footer-windows-download" />
              </div>

              <nav className="footer-links" aria-label="Footer">
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
                  <a href="/contact">Contact</a>
                </div>
                <div className="link-group">
                  <h4>Legal</h4>
                  <a href="/privacy">Privacy Policy</a>
                  <a href="/terms">Terms of Service</a>
                  <a href="/acceptable-use">Acceptable Use</a>
                  <a href="/refunds">Refund Policy</a>
                  <a href="/contact">Contact</a>
                  <a href="/cookies">Cookie Policy</a>
                </div>
              </nav>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer-bottom-divider" aria-hidden="true" />
          <p>&copy; {new Date().getFullYear()} AllModelAI. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
