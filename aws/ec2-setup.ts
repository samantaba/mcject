import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';

interface Ec2StackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

export class Ec2Stack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: Ec2StackProps) {
    super(scope, id, props);

    // Create an S3 bucket
    const bucket = new s3.Bucket(this, 'MyBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // Create security group for the EC2 instance
    const ec2SecurityGroup = new ec2.SecurityGroup(this, 'Ec2SecurityGroup', {
      vpc: props.vpc,
      description: 'Allow traffic to EC2 instance',
      allowAllOutbound: false // changed to false to restrict outbound traffic
    });

    // Define security group rules for the EC2 instance
    ec2SecurityGroup.addEgressRule(ec2.Peer.ipv4('10.0.0.0/16'), ec2.Port.tcp(5432), 'Allow PostgreSQL traffic to RDS');

    // Create security group for the ALB
    const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: props.vpc,
      description: 'Allow HTTPS traffic from Internet to ALB',
    });

    // Define security group rules for the ALB
    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow HTTPS traffic from anywhere');
    ec2SecurityGroup.addIngressRule(albSecurityGroup, ec2.Port.tcp(443), 'Allow HTTPS traffic from ALB');

    // Create IAM role and policy for the EC2 instance
    const ec2Role = new iam.Role(this, 'Ec2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });

    const s3Policy = new iam.PolicyStatement({
      resources: [bucket.bucketArn, `${bucket.bucketArn}/*`],
      actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject']
    });

    const secretsManagerPolicy = new iam.PolicyStatement({
      resources: ['arn:aws:secretsmanager:*:*:secret:pgsql_secret-*'],
      actions: ['secretsmanager:GetSecretValue']
    });

    const ecrPolicy = new iam.PolicyStatement({
      resources: ['arn:aws:ecr:*:*:repository/my-repo'],
      actions: ['ecr:GetDownloadUrlForLayer', 'ecr:BatchGetImage', 'ecr:BatchCheckLayerAvailability']
    });

    ec2Role.addToPolicy(s3Policy);
    ec2Role.addToPolicy(secretsManagerPolicy);
    ec2Role.addToPolicy(ecrPolicy);

    // Define the startup script
    const userData = ec2.UserData.forLinux();
    userData.addCommands(`
      sudo yum update -y
      sudo yum install -y docker
      sudo service docker start
      sudo usermod -a -G docker ec2-user
      aws ecr get-login-password --region region | docker login --username AWS --password-stdin <account-id>.dkr.ecr.<region>.amazonaws.com
      docker pull <account-id>.dkr.ecr.<region>.amazonaws.com/my-repo:latest
      docker run -d -p 80:80 <account-id>.dkr.ecr.<region>.amazonaws.com/my-repo:latest
    `);

    // Create the EC2 instance
    const ec2Instance = new ec2.Instance(this, 'Ec2Instance', {
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: ec2SecurityGroup,
      instanceType: new ec2.InstanceType('t3.small'),
      machineImage: new ec2.AmazonLinuxImage(),
      role: ec2Role,
      userData: userData
    });

    // Create Load Balancer
    const lb = new elbv2.ApplicationLoadBalancer(this, 'LB', {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup
    });

    const listener = lb.addListener('Listener', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS
    });

    listener.addTargets('Ec2Target', {
      targets: [new elbv2.InstanceTarget(ec2Instance)],
      port: 80
    });
  }
}

