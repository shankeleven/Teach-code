import React from 'react';
import Avatar from 'react-avatar';

const Client = ({ username, speaking }) => {
    return (
        <div className={`client ${speaking ? 'speaking' : ''}`}>
            <Avatar name={username} size={50} round="14px" />
            <span className="userName">{username}</span>
        </div>
    );
};

export default Client;