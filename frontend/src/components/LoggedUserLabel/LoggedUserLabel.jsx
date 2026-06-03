import { formatUserDisplayName } from '../../utils/pedidos';
import styles from './LoggedUserLabel.module.css';

export default function LoggedUserLabel({ user, className = '' }) {
    const name = formatUserDisplayName(user);
    if (!name) return null;

    return (
        <div className={`${styles.wrap} ${className}`.trim()}>
            <span className={styles.name}>{name}</span>
            {user?.role_label && (
                <span className={styles.role}>{user.role_label}</span>
            )}
        </div>
    );
}
