import './AccountDeleteModal.css';

export default function AccountDeleteModal({ onCancel, onConfirm, isDeleting, error }) {
  return (
    <div className="account-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-modal-title">
        <div className="account-modal-icon" aria-hidden="true">!</div>
        <h2 id="account-modal-title">Are you sure you want to delete your account?</h2>
        <p>This permanently removes your account, saved chats, and account data.</p>
        {error && <div className="account-modal-error" role="alert">{error}</div>}
        <div className="account-modal-actions">
          <button className="account-modal-no" type="button" onClick={onCancel} disabled={isDeleting}>No</button>
          <button className="account-modal-yes" type="button" onClick={onConfirm} disabled={isDeleting}>{isDeleting ? 'Deleting...' : 'Yes'}</button>
        </div>
      </section>
    </div>
  );
}
