class ErrorHandler extends Error {
    constructor(public message: string, public statusCode: number = 500) {
        super(message);
        this.statusCode = statusCode;
    }
}

export default ErrorHandler;