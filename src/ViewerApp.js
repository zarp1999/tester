import React from 'react';
import App from './App';
import LayerPanel from './LayerPanel';
import MapComponent from './MapComponent';
import styles from './ViewerApp.module.css';

const ViewerApp = () => {
    return (
        <div className={styles.va_root}>
            <div className={styles.va_left}>
                <App />
            </div>
            <div className={styles.va_right}>
                <div className={styles.va_right_top}>
                    <LayerPanel />
                </div>
                <div className={styles.va_right_bottom}>
                    <MapComponent />
                </div>
            </div>
        </div>
    );
};

export default ViewerApp;